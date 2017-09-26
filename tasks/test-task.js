'use strict'

const run = require('./run-command')

module.exports = (files) => {
  return run('nyc', ['--reporter=html', '--reporter=text', 'mocha', ...files])
}
