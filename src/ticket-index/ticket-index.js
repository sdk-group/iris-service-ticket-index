'use strict'

let Index = require("./model/aggregator.js");
let Filter = require("./model/filter.js");
let Session = require('ticket-session');
let ticket_index = {};

class TicketIndex {
	constructor() {
		this.emitter = message_bus;
		this.index = Index(message_bus);
	}

	init(cfg) {}

	launch() {
		this.emitter.listenTask('queue.emit.head', (data) => {
			return this.actionActiveHead(data)
				.then((res) => {
					console.log("STRUCT I", res);
					_.map(res, (ws_head, ws_id) => {
						_.map(ws_head, (head, user_id) => {
							let to_join = ['queue.head', data.org_addr, ws_id];
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

	getDates({
		dedicated_date,
		tz,
		offset = 0,
		schedules
	}) {
		let dedicated = dedicated_date ? moment.tz(dedicated_date, tz) : moment.tz(tz);
		let booking = moment.tz(tz);

		let now = moment.tz(tz)
			.diff(moment.tz(tz)
				.startOf('day'), 'seconds');
		let sch = _.find(_.castArray(schedules), (piece) => {
			return !!~_.indexOf(piece.has_day, dedicated.format('dddd'));
		});
		let chunks = sch ? _.flatMap(sch.has_time_description, 'data.0') : [86400];
		let today = booking.isSame(dedicated, 'day');
		let start = today ? now + offset : _.min(chunks);
		let td = [start, _.max(chunks)];
		// console.log("DATES", dedicated_date, dedicated.format(), booking.format(), start, today);
		return {
			d_date: dedicated,
			b_date: booking.format(),
			today,
			td
		};
	}

	update({
		ticket,
		org_merged
	}) {
		this.remove({
			ticket
		});
		switch (ticket.state) {
		case 'registered':
			//inject
			let [pb, lv] = _.partition(ticket_index[org_merged.id].live || [], t => _.isArray(t.time_description));
			ticket_index[org_merged.id].live = this.inject({
				ticket,
				start_time: moment.tz(org_merged.org_timezone)
					.diff(moment.tz(org_merged.org_timezone)
						.startOf('day'), 'seconds'),
				tick_index: lv
			});
			_.map(pb, tick => {
				ticket_index[org_merged.id].live = this.inject({
					ticket: tick,
					start_time: moment.tz(org_merged.org_timezone)
						.diff(moment.tz(org_merged.org_timezone)
							.startOf('day'), 'seconds'),
					tick_index: ticket_index[org_merged.id].live
				});
			});
			break;
		case 'postponed':
			ticket_index[org_merged.id].postponed = this.inject({
				ticket,
				start_time: moment.tz(org_merged.org_timezone)
					.diff(moment.tz(org_merged.org_timezone)
						.startOf('day'), 'seconds'),
				tick_index: ticket_index[org_merged.id].postponed || []
			});
			break;
		case 'processing':
		case 'called':
			//remove and remember
			ticket_index[org_merged.id].operating = ticket_index[org_merged.id].operating || [];
			ticket_index[org_merged.id].operating.push(ticket);
			break;
		case 'expired':
		case 'removed':
		case 'closed':
			//remove permanently
			break;
		case 'booked':
			//noop
			break;
		}
	}

	getTickets({
		query,
		keys
	}) {
		return this.emitter.addTask('ticket', {
				_action: 'ticket',
				query,
				keys: _.castArray(keys)
			})
			.then(_.values);
	}

	fill() {
		let orgs;
		let tzs;
		return this.emitter.addTask('workstation', {
				_action: 'organization-data'
			})
			.then(res => {
				orgs = _.keys(res);
				this.index.dissect(orgs, _.mapValues(res, 'org_merged'));
				return this.index.fill()
					.then(() => this.index.render())
					.then(() => this.index.order())
			});
	}

	inject({
		ticket,
		start_time,
		tick_index
	}) {
		let now = start_time;
		let idx = _.size(tick_index);
		ticket.priority_value = _.sum(_.map(ticket.priority, 'value'));
		// console.log("SZ", _.size(tick_index));
		// console.log("-->", ticket.label);
		_.forEach(tick_index, (tick, index) => {
			// if (index == idx - 1) {
			// idx = index;
			// return false;
			// }
			let next = now + (_.isArray(tick.time_description) ? (tick.time_description[1] - tick.time_description[0]) : tick.time_description);
			if (_.isArray(ticket.time_description)) {
				// console.log(now, next, ticket.time_description[0], tick.time_description, ticket.label, tick.label, tick.time_description[0] >= ticket.time_description[0], (!_.isArray(tick.time_description) || tick.time_description[0] >= ticket.time_description[0]));
				if (start_time >= ticket.time_description[0]) {
					// console.log("FUCKED");
					if (_.isArray(tick.time_description)) {
						if (tick.time_description[0] >= ticket.time_description[0]) {
							idx = index;
							return false;
						}
					} else {
						idx = index;
						return false;
					}
				} else {
					// console.log("UNFUCKED", next, ticket.time_description[0], next >= ticket.time_description[0], !(_.isArray(tick.time_description) && tick.time_description[0] < ticket.time_description[0]));
					if (next >= ticket.time_description[0] && !(_.isArray(tick.time_description) && tick.time_description[0] < ticket.time_description[0])) {
						idx = index;
						return false;
					}
				}
			} else {
				//EJECT
				if (ticket.priority_value > tick.priority_value || ticket.priority_value == tick.priority_value && moment(ticket.booking_date)
					.unix() < moment(tick.booking_date)
					.unix()) {
					idx = index;
					return false;
				}
			}
			now = next;
		});
		// console.log("IDX", idx, ticket.label);
		let before = _.slice(tick_index, 0, idx);
		let after = _.slice(tick_index, idx);
		// console.log("BEFORE", _.map(before, 'label'));
		// console.log("AFTER", _.map(after, 'label'));
		return _.concat(before, ticket, after);
	}

	remove({
		ticket
	}) {
		ticket_index[ticket.org_destination] = _.mapValues(ticket_index[ticket.org_destination], (ticks) => {
			return _.filter(ticks, t => t.code !== ticket.code);
		});
	}

	filter({
		service,
		org_destination,
		operator,
		destination,
		prebook_show_interval,
		now
	}) {
		let byservice = _.mapValues(ticket_index[org_destination], (ticks) => _.filter(ticks, t => !!~_.indexOf(service, t.service)));
		byservice.operating = _.filter(byservice.operating, t => t.destination == destination && (!t.operator || !!~_.indexOf(_.castArray(operator), t.operator)));
		byservice.live = _.filter(byservice.live, (t) => {
			// console.log("FILTER", now, t.time_description[0], (now + prebook_show_interval), operator, t.operator);
			if (t.operator && !~_.indexOf(_.castArray(operator), t.operator)) return false;
			return !_.isArray(t.time_description) || t.time_description[0] <= (now + prebook_show_interval + 30);
		});
		return byservice;
	}

	transformForHead({
		head,
		size
	}) {
		let sz = _.isBoolean(size) ? size : size || this.queue_head_size || 5;
		return {
			live: {
				tickets: _.concat(head.operating, _.take(head.live, sz)),
				count: _.size(head.live)
			},
			postponed: {
				tickets: _.take(head.postponed, sz),
				count: _.size(head.postponed)
			}
		};
	}

	actualize({
		dedicated_date,
		org_merged
	}) {
		ticket_index[org_merged.id] = _.mapValues(ticket_index[org_merged.id], (ticks) => {
			return _.filter(ticks, t => t.dedicated_date == dedicated_date.format('YYYY-MM-DD') || moment.isMoment(t.dedicated_date) && t.dedicated_date.isSame(dedicated_date, 'day'));
		});
		let prebooked = _.filter(ticket_index[org_merged.id].live, t => _.isArray(t.time_description));
		_.map(prebooked, p => this.updateTicket({
			org_merged,
			ticket: p
		}));
	}

	actionActiveHead({
		org_merged,
		size,
		workstation,
		last
	}) {
		let dates = this.getDates({
			tz: org_merged.org_timezone,
			schedules: org_merged.has_schedule.live
		});
		this.actualize({
			dedicated_date: dates.d_date,
			org_merged
		});
		if (last) {
			_.map(_.castArray(last), tick => {
				this.update({
					org_merged,
					ticket: tick
				});
			});
		}
		console.log("ALL ACTIVE", _.map(ticket_index[org_merged.id].live, 'label'));

		let receivers;
		return (workstation ? this.emitter.addTask('workstation', {
				_action: 'workstation',
				workstation
			}) : this.serviceProviders({
				organization: org_merged.id
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
							let head = this.index.filter({
								organization: org_merged.id,
								service: receiver_data.provides || services,
								destination: receiver_data.id,
								operator: operator
							})
							acc[operator] = this.transformForHead({
								head,
								size
							});
							return acc;
						}, {});
				});
			});
	}

	actionHeadPosition({
		org_merged,
		ticket
	}) {
		this.update({
			org_merged,
			ticket
		});
		console.log("ALL", _.map(ticket_index[org_merged.id].live, 'label'), _.map(ticket_index[org_merged.id].live, 'id'));
		let dates = this.getDates({
			tz: org_merged.org_timezone,
			schedules: org_merged.has_schedule.live
		});
		this.actualize({
			dedicated_date: dates.d_date,
			org_merged
		});
		console.log("ALL", _.map(ticket_index[org_merged.id].live, 'label'), _.map(ticket_index[org_merged.id].live, 'label'));
		let receivers;
		return this.serviceProviders({
				organization: org_merged.id
			})
			.then((res) => {
				receivers = _.keyBy(res, 'id');
				let services = _(res)
					.flatMap('provides')
					.uniq()
					.compact()
					.value();

				return _.mapValues(receivers, (receiver_data, receiver_id) => {
					let head = this.filter({
						operator: receiver_data.occupied_by,
						org_destination: org_merged.id,
						service: receiver_data.provides || services,
						destination: receiver_data.id,
						now: dates.td[0],
						prebook_show_interval: org_merged.prebook_show_interval
					});
					return _.findIndex(head.live, t => t.code == ticket.code) + _.size(head.postponed);
				});
			});
	}

	actionHead({
		workstation,
		operator,
		org_merged,
		now,
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
				let services = op.provides;
				let head = this.filter({
					org_destination: org_merged.id,
					operator,
					service: services,
					destination: workstation,
					now,
					prebook_show_interval: org_merged.prebook_show_interval
				})
				return this.transformForHead({
					head,
					size
				});
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

}

module.exports = TicketIndex;