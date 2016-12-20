'use strict'

let Index = require("./model/aggregator.js");
let Dispenser = require("./model/dispenser.js");
let hasIntersection = require("./model/util/has-intersection.js");
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
			// logger.info('queue.emit.head', data);

			// console.log("HEAD", data);
			return this.updateIndex(data)
				.then(() => this._emitHead(data));
		});

		this.emitter.listenTask('queue.update.head', (data) => {
			return this.updateIndex(data);
		});

		this.emitter.listenTask('ticket-index.reload', (data) => {
			console.log("FLUSH");
			return this.fill(data.organization)
				.then(res => Promise.map(_.castArray(data.organization), org => this._emitHead({
					organization: org
				})));
		});

		return this.fill()
			.then(() => true);
	}

	//API

	_emitHead(data) {
		let time = process.hrtime();
		return this.fillIfEmpty(data.organization)
			.then(res => this.index.loadIfOutdated(data.organization))
			.then(res => this.actionActiveHead(data))
			.then((res) => {
				// console.log("STRUCT I", require('util')
				// 	.inspect(res, {
				// 		depth: null
				// 	}));
				let diff = process.hrtime(time);
				console.log('ACTIVE HEAD IN %d mseconds', (diff[0] * 1e9 + diff[1]) / 1000000);
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
	}


	fill(organizations) {
		return this.emitter.addTask('workstation', {
				_action: 'organization-data',
				organization: organizations
			})
			.then(res => {
				let orgs = Object.keys(res);
				console.log("filling", orgs);
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

	fillIfEmpty(org) {
		if (!!this.index.section(org))
			return Promise.resolve(true);
		else
			return this.fill()
				.then(() => true);
	}


	takeHead(
		section,
		filter,
		size
	) {
		let sz = _.isBoolean(size) ? size : size || this.queue_head_size || 5;
		return this.dispenser.dispense(section, sz, filter);
	}

	updateIndex({
		organization,
		last = []
	}) {
		let upd = (last.constructor === Array) ? last : [last];
		_.map(upd, entity => {
			this.index.updateLeaf(organization, entity);
		});
		return Promise.resolve(true);
	}

	actionProvidersByWorkstation({
		organization,
		concrete
	}) {
		return this.emitter.addTask('workstation', {
				_action: 'organization-data',
				organization: organization,
				embed_schedules: false
			})
			.then((res) => {
				let org = res[organization];
				let mode = org.org_merged.workstation_filtering_enabled ? 'destination' : 'operator';

				return Promise.props({
					providers: mode != 'destination' ? this.emitter.addTask('agent', {
						_action: 'providers',
						role: 'Operator',
						organization: organization,
						state: ['active']
					}) : false,
					workstations: concrete ? this.emitter.addTask('workstation', {
							_action: 'by-id',
							workstation: concrete
						})
						.then(res => _.values(res)) : this.emitter.addTask('workstation', {
							_action: 'get-workstations-cache',
							organization: organization,
							device_type: 'control-panel'
						})
						.then(res => res['control-panel']),
					mode: mode
				});
			})
			.then(({
				providers,
				workstations,
				mode
			}) => {
				if (mode != 'destination') {
					let l = workstations.length,
						ll, lll, op, srv,
						ws, provision;
					while (l--) {
						ws = workstations[l];
						if (!ws)
							continue;
						provision = {}, ll = ws.occupied_by.length;
						while (ll--) {
							op = providers[ws.occupied_by[ll]];
							if (!op)
								continue;
							lll = op.provides.length;
							while (lll--) {
								srv = op.provides[lll];
								if (!provision[srv])
									provision[srv] = true;
							}
						}
						ws.provides = provision['*'] ? '*' : Object.keys(provision);
					}
				}
				// console.log("######################################################\n", workstations);
				return workstations;
			});
	}


	serviceProviders({
		organization,
		operator,
		workstation,
		mapping = true
	}) {
		return Promise.props({
				occupation_map: mapping ? this.emitter.addTask('workstation', {
					_action: 'occupation-map',
					organization: organization,
					device_type: 'control-panel',
					workstation: workstation,
					agent: operator
				}) : false,
				org: this.emitter.addTask('workstation', {
					_action: 'organization-data',
					organization: organization,
					embed_schedules: false
				})
			})
			.then((res) => {
				let org = res.org[organization];
				let mode = org.org_merged.workstation_filtering_enabled ? 'destination' : 'operator';
				let map;
				if (mapping) {
					if (workstation) {
						map = _.pick(res.occupation_map, workstation);
					} else {
						map = res.occupation_map;
					}
				}
				return Promise.props({
					providers: mode == 'destination' ? this._workstationProviders(organization, workstation) : this._employeeProviders(organization, operator),
					occupation: map,
					mode: mode
				});
			});
	}

	_workstationProviders(organization, concrete) {
		return concrete ? this.emitter.addTask('workstation', {
				_action: 'by-id',
				workstation: concrete
			})
			.then(res => {
				if (res[concrete].attached_to == organization && (res[concrete].state == 'active' || res[concrete].state == 'paused'))
					return res;
				return {};
			}) :
			this.emitter.addTask('workstation', {
				_action: 'providers',
				organization: organization,
				device_type: 'control-panel',
				state: ['active', 'paused']
			});
	}

	_employeeProviders(organization, concrete) {
		return concrete ? this.emitter.addTask('agent', {
				_action: 'by-id',
				agent_id: concrete
			})
			.then(res => {
				if (res[concrete].state == 'active' || res[concrete].state == 'paused')
					return res;
				return {};
			}) :
			this.emitter.addTask('agent', {
				_action: 'providers',
				role: 'Operator',
				organization: organization,
				state: ['active', 'paused']
			});
	}


	actionActiveHead({
		organization,
		size,
		workstation,
		operator
	}) {
		// console.log("UPD", last);
		// console.log("--------------------------------------------->", workstation, organization)
		return this.serviceProviders({
				organization: organization,
				workstation: workstation,
				operator: operator
			})
			.then(({
				providers: receivers,
				occupation: occupation_map
			}) => {
				// console.log("RECEIVER", receivers);
				// console.log("OCCUPATION", occupation_map);
				return _.mapValues(occupation_map, (op_ids, ws_id) => {
					return _.reduce(op_ids, (acc, op_id) => {
						let receiver_data = receivers[ws_id] || receivers[op_id];
						if (!receiver_data) {
							console.log("##############################################################################################");
							console.log("RECEIVER MISSING", op_id, ws_id, occupation_map);
							console.log("##############################################################################################");
							return acc;
						}

						let filter = {
							organization: organization,
							service: receiver_data.provides || [],
							booking_method: receiver_data.filtering_method || "*",
							destination: ws_id,
							operator: op_id
						};
						acc[op_id] = this.takeHead(organization, filter, size);
						return acc;
					}, {});
				});
			});
	}

	actionHeadPosition({
		organization,
		id
	}) {
		return this.serviceProviders({
				organization: organization
			})
			.then(({
				providers: receivers,
				occupation: occupation_map
			}) => {
				// console.log("RECEIVER", receivers, occupation_map);

				let pos = _(occupation_map)
					.flatMap((op_ids, ws_id) => {
						return _.map(op_ids, (operator) => {
							let receiver_data = receivers[ws_id] || receivers[operator];
							let filter = {
								organization: organization,
								service: receiver_data.provides || [],
								booking_method: receiver_data.filtering_method || "*",
								destination: ws_id,
								state: ['postponed', 'registered', 'called', 'processing'],
								operator: operator
							};
							return this.dispenser.findIndex(organization, id, filter);
						});
					})
					.max();

				return pos;
			});
	}

	actionHead({
		workstation,
		operator,
		organization,
		size
	}) {
		return this.serviceProviders({
				organization: organization,
				operator: operator,
				workstation: workstation
			})
			.then(({
				providers
			}) => {
				// console.log(providers);
				let op = providers[workstation] || providers[operator];
				if (!op)
					return Promise.reject(new Error("Requested operator/workstation is inactive."));
				let filter = {
					organization: organization,
					service: op.provides,
					booking_method: op.filtering_method || "*",
					destination: workstation,
					operator: operator
				};
				return this.takeHead(organization, filter, size);
			});
	}
	actionConfirmSession({
		source: data,
		org_data: org_data,
		confirm: confirm
	}) {
		let s_data = {
			dedicated_date: data.dedicated_date,
			organization: org_data.id,
			user_info: data.user_info
		};
		return this.createTickets(data, org_data)
			.then(ticks => {
				let ts = _.map(ticks, t => t.getSource());

				//@FIXIT code must be crafted here, not in tickets
				return confirm(ts);
			})
			.then(confirmed => {
				if (!confirmed.success)
					return confirmed;

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
			});
	}

	actionCurrent({
		workstation,
		operator,
		organization,
		state: state = ['processing', 'called'],
		serialize: serialize = false
	}) {
		// let active = this.index.active(organization);
		let res = this.index.filter(organization, {
			organization: organization,
			service: '*',
			booking_method: "*",
			destination: workstation,
			operator: operator,
			state: state
		});
		return _.map(res, t => {
			let tick = this.index.ticket(organization, t);
			return serialize ? tick.serialize() : tick;
		});
	}

	actionNext({
		workstation,
		operator,
		organization,
		lock: lock = true
	}) {
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
		// console.log("CURRENT", current);


		return this.serviceProviders({
				organization: organization,
				operator: operator,
				workstation: workstation,
				mapping: false
			})
			.then(({
				providers
			}) => {
				let op = providers[workstation] || providers[operator];
				let flt = {
					organization: organization,
					service: op.provides,
					booking_method: op.filtering_method || "*",
					destination: workstation,
					operator: operator,
					state: ['registered']
				};
				if (current.length > 0) {
					let sc = this.index.section(organization);
					let criteria = sc.isAppliable.bind(sc, flt);
					curr_tick = current[0];
					response.current = curr_tick.serialize();
					curr_session = this.index.session(organization, curr_tick.get("session")) || this.index.section(organization)
						.sessionByLeaf(curr_tick.id);
					let next = curr_session.next(criteria);
					console.log("NEXT BY SESSIOn", next);
					if (next)
						response.next = next.serialize();
				}
				if (response.next)
					return response;

				//solver algo starts here
				let all = this.index.filter(organization, flt);
				let idx = (all.length > 0) ? all[0] : null;
				if (idx !== null) {
					let n_tick = this.index.ticket(organization, idx);
					if (lock) {
						n_tick.set("operator", (operator ? operator : null));
						n_tick.set("destination", (workstation ? _.castArray(workstation) : null));
					}
					console.log("N_TICK", this.index.ticket(organization, idx));
					response.next = n_tick.serialize();
				}
				this.index.section(organization)
					.invalidate();
				return response;
			});
	}

	actionVirtualRoute({
		ticket: tick_data,
		service: service,
		prehistory = []
	}) {
		let anchestor = tick_data.inherits || tick_data.id;
		let build_data = tick_data;
		let session = this.index.session(tick_data.org_destination, tick_data.session) ||
			this.index.section(tick_data.org_destination)
			.sessionByLeaf(tick_data.id);
		if (!session)
			return Promise.reject(new Error("Session not found"));
		session.find(tick_data.id)
			.set("session", session.identifier());
		let tick;
		let anchestor_tick = session.find(anchestor);
		let generation = (anchestor_tick.get("inheritance_counter") || 0) + 1;

		let hst_i = tick_data.history.length - 2;

		if (tick_data.id == anchestor)
			anchestor_tick.update(tick_data);
		anchestor_tick.set("inheritance_counter", generation);

		build_data.service = service;
		build_data.inherits = anchestor;
		build_data.inheritance_level = generation;
		build_data.state = "registered";
		build_data.id = null;

		return this.emitter.addTask('history', {
				_action: 'make-entry',
				subject: {
					type: 'system'
				},
				event_name: 'register',
				context: {
					inherits: anchestor,
					inheritance_level: generation
				}
			})
			.then((hst) => {
				build_data.history = [hst];
				build_data.history.concat(prehistory);

				return this.index.section(build_data.org_destination)
					.virtualizeTicket(build_data);
			})
			.then(ticket => {
				return this.index.saveTickets(ticket)
			})
			.then((tickets) => {
				tick = tickets[0];
				let hst = anchestor_tick.get("history");
				hst[hst_i].context.offspring = tick.id;
				anchestor_tick.set("history", hst);
				return this.index.saveTickets(anchestor_tick);
			})
			.then((tickets) => {
				session.virtualRoute(tick);
				return this.index.saveSession(session);
			})
			.then(res => tick.serialize());
	}

	actionSplittedRoute({
		ticket: tick_data,
		organization: organization,
		destination: destination,
		operator: operator,
		callback: callback
	}) {
		let session;
		let build_data = tick_data;
		let filter_fn;
		return this.actionProvidersByWorkstation({
				organization: organization,
				concrete: destination
			})
			.then((providers) => {
				let provision = {},
					l, srv;
				_.map(providers, p => {
					l = p.provides.length;

					while (l--) {
						srv = p.provides[l];
						if (!provision[srv])
							provision[srv] = true;
					}
				});
				let services = provision['*'] ? '*' : Object.keys(provision);
				// console.log("SRV-------------------------------------->>>>>>>>>>>>>>", services);
				filter_fn = function (entity) {
					return services === '*' || !!~services.indexOf(entity.get("service"));
				}
				session = this.index.session(build_data.org_destination, build_data.session) ||
					this.index.section(build_data.org_destination)
					.sessionByLeaf(build_data.id);
				if (!session)
					return Promise.reject(new Error("Session not found"));
				session.find(tick_data.id)
					.set("session", session.identifier());
				session.splittedRoute(filter_fn);
				return this.index.saveSession(session);
			})
			.then(res => {
				// console.log(session);
				let tick = session.find(build_data.id);
				tick.update(build_data);
				let tickets = session.tickets(),
					len = tickets.length,
					t, cb_ticks = [];
				let dst = !_.isEmpty(destination) && destination || undefined;
				while (len--) {
					t = tickets[len];
					if (t.isInactive())
						continue;
					if (filter_fn(t)) {
						cb_ticks.push(t);
						if (dst) {
							t.unlockField("destination");
							t.set("destination", dst);
							t.lockField("destination");
						}
						if (operator !== undefined) {
							t.unlockField("operator");
							t.set("operator", operator);
							t.lockField("operator");
						}
					} else {
						t.unlockField("destination");
						t.set("destination", null);
						t.unlockField("operator");
						t.set("operator", null);
					}
				}
				callback && callback(cb_ticks);
				return this.index.saveTickets(tickets);
			})
			.then(res_tick => res_tick[0] && res_tick[0].serialize());
	}

	actionClearedRoute({
		ticket: tick_data,
		callback: callback
	}) {
		let session = this.index.session(tick_data.org_destination, tick_data.session) ||
			this.index.section(tick_data.org_destination)
			.sessionByLeaf(tick_data.id);
		if (!session)
			return Promise.reject(new Error("Session not found"));
		session.find(tick_data.id)
			.set("session", session.identifier());
		let tickets = session.tickets(),
			l = tickets.length,
			tick;
		while (l--) {
			tick = tickets[l];
			if (tick.isInactive())
				continue;
			if (tick.id == tick_data.id)
				tick.update(tick_data);
			tick.unlockField("operator")
				.unlockField("destination");
			tick.set("operator", null);
			tick.set("destination", null);

		}
		callback && callback(tickets);
		return this.index.saveTickets(tickets);
	}

	actionRelatedTickets({
		ticket: tick_data
	}) {
		return this.index.loadIfOutdated(tick_data.org_destination)
			.then(() => {
				let session = this.index.session(tick_data.org_destination, tick_data.session) ||
					this.index.section(tick_data.org_destination)
					.sessionByLeaf(tick_data.id);
				if (!session) {
					return this.emitter.addTask("ticket", {
							_action: "session-tickets",
							session: tick_data.session
						})
						.then(res => res.tickets);
				}
				let tickets = session.tickets();
				return _.map(tickets, t => t.serialize());
			});
	}


	createTickets(source, org_data) {
		let services = !source.service ? [] : (source.service.constructor === Array ? source.service : [source.service])
		let service_count = !source.service_count ? [] : (source.service_count.constructor === Array ? source.service_count : [source.service_count])

		return this.emitter.addTask('ticket', {
				_action: 'basic-priorities'
			})
			.then(priority => {
				let computed_priority = this._computePriority(priority, org_data.priority_description, source.priority);
				let pack_sign = services.length > 1;
				let build_data = _.map(services, (srv_id, i) => {
					return {
						label: this._composePrefix(computed_priority),
						forced_label: source.label,
						priority: _.cloneDeep(computed_priority),

						service: srv_id,
						service_count: _.parseInt(service_count[i]) || 1,
						pack_member: pack_sign,

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
						user_info: source.user_info,
						user_info_description: source.user_info_description
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


	actionTodayTickets({
		organization,
		active_sessions_only = false
	}) {
		let section = this.index.section(organization);
		if (!section)
			return [];
		return _.map((active_sessions_only ? section.activeTickets() : section.allTickets()), t => t.serialize());
	}

	actionQueryTodayTickets({
		organization,
		query,
		keys,
		active_sessions_only = false
	}) {
		let section = this.index.section(organization);
		if (!section)
			return [];
		let ticks = _.map((active_sessions_only ? section.activeTickets() : section.allTickets()), t => t.serialize());
		let filtered = ticks;
		// console.log("FILTEWRD", query);
		if (query) {
			_.unset(query, 'dedicated_date');
			filtered = _.filter(_.compact(ticks), (tick) => {
				return _.reduce(query, (acc, val, key) => {
					let res = true;
					if (!_.isPlainObject(val)) {
						//OR
						res = hasIntersection(val, tick[key]);
					} else {
						res = _.isEqual(val, tick[key]);
					}
					return res && acc;
				}, true);
			});
		}
		if (keys) {
			filtered = _.filter(ticks, t => !!~keys.indexOf(t.id));
		}
		// console.log("*******************************************", filtered);
		return filtered;

	}

}

module.exports = TicketIndex;