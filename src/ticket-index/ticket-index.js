'use strict'

let Index = require("./model/aggregator.js");
let Dispenser = require("./model/dispenser.js");
let ticket_index = {};

class TicketIndex {
	constructor() {
		this.emitter = message_bus;
		this.index = Index(message_bus);
		this.dispenser = Dispenser(this.index);
	}

	init(config) {
		this.queue_head_size = config.queue_head_size;
	}

	launch() {
		this.emitter.listenTask('queue.emit.head', (data) => {
			return this.index.loadIfOutdated(data.organization)
				.then(res => this.actionActiveHead(data))
				.then((res) => {
					// console.log("STRUCT I", require('util')
					// 	.inspect(res, {
					// 		depth: null
					// 	}));
					_.map(res, (ws_head, ws_id) => {
						_.map(ws_head, (head, user_id) => {
							let to_join = ['queue.head', this.index.addr(data.organization), ws_id];
							let addr = {
								user_id
							};
							console.log("EMIT HEAD", _.join(to_join, "."), _.map(head.live.tickets, 'label'), _.map(head.live.tickets, 'id'));
							this.emitter.emit('broadcast', {
								event: _.join(to_join, "."),
								addr,
								data: head
							});
						});
					});
					return Promise.resolve(true);
				});
		});


		return this.fill()
			.then(() => true);
	}

	//API
	fill() {
		return this.emitter.addTask('workstation', {
				_action: 'organization-data'
			})
			.then(res => {
				let orgs = Object.keys(res);
				let keydata = _.mapValues(res, pack => {
					pack.org_merged.emit_path = pack.org_addr;
					return pack.org_merged;
				});

				this.index.dissect(orgs, keydata);
				return this.index.fill();
			})
			.then(() => this.index.render())
			.then(() => this.index.order());
	}


	takeHead(
		section,
		filter,
		size
	) {
		let sz = _.isBoolean(size) ? size : size || this.queue_head_size || 5;
		return this.dispenser.dispense(section, sz, filter);
	}

	actionActiveHead({
		organization,
		size,
		workstation,
		last = []
	}) {
		console.log("UPD", last);
		let upd = (last.constructor === Array) ? last : [last];
		_.map(upd, entity => {
			this.index.updateLeaf(organization, entity);
		});

		let receivers;
		return (workstation ? this.emitter.addTask('workstation', {
				_action: 'workstation',
				workstation
			}) : this.serviceProviders({
				organization: organization
			}))
			.then((res) => {
				receivers = _.keyBy(res, 'id');
				let services = _(res)
					.flatMap('provides')
					.uniq()
					.compact()
					.value();

				return _.mapValues(receivers, (receiver_data, receiver_id) => {
					return _(receiver_data.occupied_by)
						.castArray()
						.reduce((acc, operator) => {
							let filter = {
								organization: organization,
								service: receiver_data.provides || services,
								destination: receiver_data.id,
								operator: operator
							};
							acc[operator] = this.takeHead(organization, filter, size);
							return acc;
						}, {});
				});
			});
	}

	actionHeadPosition({
		organization,
		id
	}) {
		let receivers;
		return this.serviceProviders({
				organization: organization
			})
			.then((res) => {
				receivers = _.keyBy(res, 'id');
				let services = _(res)
					.flatMap('provides')
					.uniq()
					.compact()
					.value();

				return _(receivers)
					.map((receiver_data, receiver_id) => {
						let filter = {
							operator: receiver_data.occupied_by,
							organization: organization,
							service: receiver_data.provides || services,
							destination: receiver_data.id,
							state: ['postponed', 'registered', 'called', 'processing']
						};
						return this.dispenser.findIndex(organization, id, filter);
					})
					.max();
			});
	}

	actionHead({
		workstation,
		operator,
		organization,
		services = [],
		size
	}) {
		let srv = _.castArray(services);
		return (_.isEmpty(srv) ? this.emitter.addTask('workstation', {
					_action: 'workstation',
					workstation: workstation
				})
				.then(res => res[workstation]) : Promise.resolve({
					provides: srv
				}))
			.then((op) => {
				let filter = {
					organization: organization,
					service: op.provides,
					destination: workstation,
					operator: operator
				};
				return this.takeHead(organization, filter, size);
			});
	}

	actionConfirmSession({
		source: data,
		org_data: org_data,
		service_data: service_data,
		confirm: confirm
	}) {
		let s_data = {
			dedicated_date: data.dedicated_date,
			organization: org_data.id,
			user_info: data.user_info
		};
		return this.createTickets(data, org_data, service_data)
			.then(ticks => {
				let ts = _.map(ticks, t => t.getSource());

				//@FIXIT code must be crafted here, not in tickets
				s_data.code = ts[0].code;
				return confirm(ts);
			})
			.then(confirmed => {
				if (confirmed.success) {
					let keys = confirmed.keys;
					let type = keys.length == 1 ? 'idle' : 'picker';
					let data = keys.length == 1 ? keys : _.map(keys, k => ({
						type: 'idle',
						data: k
					}));
					s_data.description = {
						data: data,
						type: type
					};
					s_data.uses = keys;

					return this.index.createSession(s_data)
						.then(session => this.index.saveSession(session))
						.then(session => {
							confirmed.response = _(session.render())
								.castArray()
								.map(t => t.set("session", session.identifier()))
								.value();
							this.index.add(session);
							return this.index.saveTickets(confirmed.response);
						})
						.then(res => {
							confirmed.response = _.map(confirmed.response, t => t.serialize());
							return confirmed;
						});
				}
				return confirmed;
			});
	}


	serviceProviders({
		organization
	}) {
		return this.emitter.addTask('workstation', {
				_action: 'active-workstations',
				organization: organization,
				state: ['active', 'paused'],
				device_type: 'control-panel'
			})
			.then((res) => res['control-panel']);
	}

	actionCurrent({
		workstation,
		operator,
		organization
	}) {
		// let active = this.index.active(organization);
		return this.index.filter(organization, {
			organization: organization,
			service: '*',
			destination: workstation,
			operator: operator,
			state: ['processing', 'called']
		});
	}

	actionNext({
		workstation,
		operator,
		organization,
		services = []
	}) {
		let srv = _.castArray(services);
		let curr_tick, curr_session;
		let current = this.actionCurrent({
			workstation,
			operator,
			organization
		});
		let response = {
			current: null,
			next: null
		};

		if (current.length > 0) {
			curr_tick = this.index.ticket(organization, current[0]);
			response.current = curr_tick.serialize();
			curr_session = this.index.session(organization, curr_tick.get("session"));
			let next = curr_session.next();
			if (next)
				response.next = next.serialize();
		}
		if (response.next)
			return response;

		return (_.isEmpty(srv) ? this.emitter.addTask('workstation', {
					_action: 'workstation',
					workstation
				})
				.then(res => res[workstation]) : Promise.resolve({
					provides: srv
				}))
			.then((op) => {
				let all = this.index.filter(organization, {
					organization: organization,
					service: op.provides,
					destination: workstation,
					operator: operator,
					state: ['registered']
				});
				let idx = (all.length > 0) ? all[0] : null;
				if (idx !== null)
					response.next = this.index.ticket(organization, idx)
					.serialize();
				return response;
			});
	}

	createTickets(source, org_data, service_data) {
		let services = !source.service ? [] : (source.service.constructor === Array ? source.service : [source.service])
		let service_count = !source.service_count ? [] : (source.service_count.constructor === Array ? source.service_count : [source.service_count])

		return this.emitter.addTask('ticket', {
				_action: 'basic-priorities'
			})
			.then(priority => {
				let computed_priority = this._computePriority(priority, org_data.priority_description, source.priority);

				let build_data = _.map(services, (srv_id, i) => {
					return {
						label: this._composePrefix(computed_priority),
						priority: computed_priority,

						service: srv_id,
						service_count: _.parseInt(service_count[i]) || 1,

						operator: source.operator,
						destination: source.destination,
						org_destination: org_data.id,

						dedicated_date: source.dedicated_date,
						booking_method: source.booking_method,
						history: source.history,
						time_description: source.time_description,

						state: source.state,
						called: 0,
						expiry: source.expiry || 0,
						user_info: source.user_info
					};
				});
				//@FIXIT do it through the main aggregator
				return this.index.section(org_data.id)
					.createTickets(build_data);
			})
			.then(tickets => Promise.map(tickets,
				ticket => Promise.props({
					label: this.emitter.addTask('code-registry', {
						_action: 'make-label',
						prefix: ticket.get('label')
							.length && ticket.get('label'),
						office: ticket.get('org_destination'),
						date: ticket.get('dedicated_date')
					}),
					code: source.code || this.emitter.addTask('code-registry', {
						_action: 'make-pin',
						prefix: org_data.pin_code_prefix
					})
				})
				.then(codes => {
					ticket.set('code', codes.code);
					ticket.set('label', codes.label);
					return ticket;
				})));
	}

	_computePriority(basic_description, org_override = {}, manual_override = {}) {
		let prior_keys = _.keys(manual_override);
		let basic = _.mapValues(_.pick(basic_description, prior_keys), v => v.params);
		let local = _.pick(org_override, prior_keys);
		return _.merge(basic, local, manual_override);
	}

	_composePrefix(priority_description) {
		return _(priority_description)
			.map('prefix')
			.sortBy()
			.sortedUniq()
			.join('');
	}

}

module.exports = TicketIndex;