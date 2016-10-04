'use strict'

let Order = require("./ordering-indexer.js");
let Filter = require("./filtering-indexer.js");

let Patchwerk = require("patchwerk");
let Session = require("ticket-session");

let AggregatorSection = require("./aggregator-section.js");

//ORDER PRESERVED
const indexers_config = {
	order: {
		default: ['actualize', 'live-ordering', 'prebook-ordering']
	},
	filter: {
		default: ['state-allowed', 'prebook-timing', 'service-allowed', 'workstation-provides', 'operator-provides']
	}
};

class Aggregator {
	constructor(emitter) {
		this.keymap = {};
		this.data = [];
		this.emitter = emitter;
		this.patchwerk = Patchwerk(emitter);
	}

	section(section) {
		return this.data[this.keymap[section]];
	}

	dissect(sections = false, keydata = {}, idx_config = indexers_config) {
		if (sections.constructor === Array) {
			let l = sections.length,
				len = this.data.length,
				inj,
				prev, sname;
			while (l--) {
				sname = sections[l];
				prev = this.section(sname);
				if (!prev) {
					this.keymap[sname] = len++;
					inj = new AggregatorSection(this.patchwerk, sname, keydata[sname]);
					inj.setIndexers(
						new Filter(idx_config.filter[sname] || idx_config.filter.default),
						new Order(idx_config.order[sname] || idx_config.order.default)
					);
					this.data.push(inj);
				} else {
					prev.updateKeydata(keydata[sname]);
				}
			}
		}
	}

	fill() {
		return this.loadSessions();
	}


	//@TODO: move it to office model object
	addr(section) {
		return this.section(section)
			.addr();
	}

	active(section) {
		return this.section(section)
			.active();
	}

	ticket(section, idx) {
		return this.section(section)
			.ticket(idx);
	}

	session(section, id) {
		return this.section(section)
			.session(id);
	}

	order(params = {}) {
		let l = this.data.length;
		while (l--) {
			this.data[l].order();
		}
		return this;
	}

	filter(section, params) {
		return this.section(section)
			.filter(params);
	}

	updateLeaf(section, leaf) {
		this.section(section)
			.updateLeaf(leaf);
	}

	render(sections) {
		let sect = sections || Object.keys(this.keymap);
		let l = sect.length;
		while (l--) {
			this.section(sect[l])
				.render();
		}
		return this;
	}

	loadIfOutdated(section) {
		return this.section(section)
			.loadIfOutdated();
	}

	loadSessions() {
		return Promise.map(this.data, (section) => section.load());
	}


	createSession(data) {
		return this.section(data.organization)
			.createSession(data);
	}

	createTickets(data) {
		return this.section(data.organization)
			.createSession(data);
	}

	add(session) {
		this.section(session.attachment())
			.add(session);
	}

	saveSession(session) {
		return this.section(session.attachment())
			.saveSession(session);
	}

	saveTickets(tickets) {
		return Promise.map(_.castArray(tickets), t => this.patchwerk.save(t, t.creation_params));
	}

}

module.exports = function (emitter) {
	return new Aggregator(emitter);
};