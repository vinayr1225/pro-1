'use strict'

const camelCaseKeys = require('camelcase-keys')
const convict = require('./solitary-convict')
const cson = require('cson-parser')
const freezeDeep = require('deep-freeze')
const fs = require('fs')
const json = require('json5')
const ospath = require('path')
const yaml = require('js-yaml')

const ARGS_SCANNER_RX = /(?:([^=,]+)|(?==))(?:,|$|=(|("|').*?\3|[^,]+)(?:,|$))/g

registerCustomFormats()

/**
 * Builds a playbook object according to the provided schema from the specified
 * arguments and environment variables.
 *
 * Accepts an array of command-line arguments (in the form of option flags and
 * switches) and a map of environment variables and translates this data into a
 * playbook object according the the specified schema. If no schema is
 * specified, the default schema provided by this package is used.
 *
 * @memberof playbook-builder
 *
 * @param {Array} [args=[]] - An array of arguments in the form of command-line
 *   option flags and switches. Should begin with the first flag or switch.
 * @param {Object} [env={}] - A map of environment variables.
 * @param {Object} [schema=undefined] - A convict configuration schema.
 *
 * @returns {Object} A playbook object containing a hierarchical structure that
 *   mirrors the configuration schema. Keys in the playbook are camelCased.
 */
function buildPlaybook (args = [], env = {}, schema = undefined) {
  const config = loadConvictConfig(args, env, schema)

  const specFileRelPath = config.get('playbook')
  if (specFileRelPath) {
    let specFileAbsPath = ospath.resolve(specFileRelPath)
    if (ospath.extname(specFileAbsPath)) {
      if (!fs.existsSync(specFileAbsPath)) throw new Error('playbook spec file does not exist')
    } else if (fs.existsSync(specFileAbsPath + '.yml')) {
      specFileAbsPath += '.yml'
    } else if (fs.existsSync(specFileAbsPath + '.json')) {
      specFileAbsPath += '.json'
    } else if (fs.existsSync(specFileAbsPath + '.cson')) {
      specFileAbsPath += '.cson'
    } else {
      throw new Error('playbook spec file could not be resolved')
    }
    config.load(parseSpecFile(specFileAbsPath))
    if (specFileRelPath !== specFileAbsPath) config.set('playbook', specFileAbsPath)
  }

  config.validate({ allowed: 'strict' })

  return exportModel(config)
}

function loadConvictConfig (args, env, customSchema) {
  return convict(customSchema || require('./config/schema'), { args: args, env: env })
}

function parseSpecFile (specFilePath) {
  const data = fs.readFileSync(specFilePath, 'utf8')

  switch (ospath.extname(specFilePath)) {
    case '.yml':
      return yaml.safeLoad(data)
    case '.json':
      return json.parse(data)
    case '.cson':
      return cson.parse(data)
    default:
      throw new Error('Unsupported file type')
  }
}

function exportModel (config) {
  const properties = config.getProperties()
  // FIXME would be nice if camelCaseKeys could exclude a subtree (e.g., asciidoc)
  const asciidocProperty = properties.asciidoc
  delete properties.asciidoc
  const playbook = camelCaseKeys(properties, { deep: true })
  if (asciidocProperty) playbook.asciidoc = asciidocProperty
  playbook.dir = playbook.playbook ? ospath.dirname((playbook.file = playbook.playbook)) : process.cwd()
  delete playbook.playbook
  return freezeDeep(playbook)
}

function registerCustomFormats () {
  convict.addFormat({
    name: 'object',
    validate: (val) => typeof val === 'object',
    coerce: (val) => {
      const accum = {}
      let match
      ARGS_SCANNER_RX.lastIndex = 0
      while ((match = ARGS_SCANNER_RX.exec(val))) {
        const [, k, v] = match
        if (k) accum[k] = v ? yaml.safeLoad(v) : ''
      }
      return accum
    },
  })
}

module.exports = buildPlaybook
