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
			return this.actionActiveHead(data)
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
		// console.log("UPD", last);
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
		code
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

				return _.mapValues(receivers, (receiver_data, receiver_id) => {
					let filter = {
						operator: receiver_data.occupied_by,
						organization: organization,
						service: receiver_data.provides || services,
						destination: receiver_data.id
					};
					return this.dispenser.findIndex(organization, code, filter);
				});
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
					workstation
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

	actionCreateSession(data) {
		return this.index.createSession(data)
			.then(session => this.index.saveSession(session))
			.then(session => this.index.add(session));
	}


	serviceProviders({
		organization
	}) {
		return this.emitter.addTask('workstation', {
				_action: 'active-workstations',
				organization,
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
			response.current = curr_tick;
			curr_session = this.index.session(organization, curr_tick.code());
			response.next = curr_session.next();
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
					response.next = this.index.ticket(organization, idx);
				return response;
			});
	}

}

module.exports = TicketIndex;