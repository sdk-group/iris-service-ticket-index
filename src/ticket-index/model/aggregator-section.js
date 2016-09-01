'use strict';

let Session = require("ticket-session");
let moment = require("moment-timezone");

class AggregatorSection {
	constructor(patchwerk, name, keydata = {}) {
		this.name = name;
		this.keydata = keydata;
		this.keymap = {};
		this.moment = moment.tz(this.keydata.org_timezone);
		this.patchwerk = patchwerk;
		this.data = [];
		this.rendered = [];
		this.filtering = null;
		this.ordering = null;
	}

	updateKeydata(value) {
		this.keydata = value;
		this.moment = moment.tz(this.keydata.org_timezone);
		return this;
	}

	order() {
		this.ordering.run(this.keydata);
		return this;
	}

	setIndexers(filter, order) {
		this.filtering = filter;
		this.filtering.setSource(this);

		this.ordering = order;
		this.ordering.setSource(this);
	}

	render() {
		let result = [],
			l = this.data.length;
		this.rendered = [];
		while (l--) {
			this.rendered = this.rendered.concat(this.data[l].render());
		}
		return this.rendered;
	}

	getRendered() {
		//can implement render expiration here
		//if(expired) return this.render()
		return this.rendered;
	}

	add(session) {
		let id = session.identifier();
		if (this.keydata[id] === undefined) {
			this.data.push(session);
		} else {
			this.data[this.keydata[id]] = session;
		}
	}

	load() {
		let date = this.moment.format('YYYY-MM-DD');
		return Promise.all([this.patchwerk.get('TicketSession', {
				department: this.name,
				date: date,
				counter: '*'
			}), this.patchwerk.get('Ticket', {
				department: this.name,
				date: date,
				counter: '*'
			})])
			.then(res => {
				let sessions = res[0],
					l = sessions.length,
					session_data;

				while (l--) {
					session_data = sessions[l];
					//@FIXIT
					if (session_data.properties.description !== undefined) {
						this.add(Session(session_data, res[1]));
					}
				}

				// console.log("SESSIONS", this);
				return true;
			})
	}

	saveSession(session) {
		let model = session.extract();
		let date = this.moment.format('YYYY-MM-DD');
		return this.patchwerk.save(model, {
				department: this.name,
				date: date
			})
			.then(res => session);
	}

	createSession(data) {
		return Promise.all([this.patchwerk.create('TicketSession', data, {
				department: data.organization,
				date: data.dedicated_date,
				counter: "*"
			}), this.patchwerk.get('Ticket', {
				department: data.organization,
				date: data.dedicated_date,
				counter: _.map(data.uses, id => id.split('--')[1])
			})])
			.then((res) => {
				return Session(res[0], res[1]);
			});

	}
}

module.exports = AggregatorSection;