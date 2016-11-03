'use strict'

let events = {
	"ticket-index": {}
};

let tasks = [];


module.exports = {
	module: require('./ticket-index.js'),
	name: 'ticket-index',
	permissions: [],
	exposed: true,
	tasks: tasks,
	events: {
		group: 'ticket-index',
		shorthands: events['ticket-index']
	}
};