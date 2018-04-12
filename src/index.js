// Force sentry DSN into environment variables
// In the future, will be set by the stack
process.env.SENTRY_DSN =
  process.env.SENTRY_DSN ||
  'https://89d41b28d3844f1bb53fa010ea78503c:75dc52afdcca41aca4e1351c80affc6c@sentry.cozycloud.cc/33'

const { BaseKonnector } = require('cozy-konnector-libs')
const { authenticate } = require('./auth')
const helpers = require('./helpers')
const products = require('./products')

module.exports = new BaseKonnector(start)

function start(fields) {
  return authenticate(fields.login, fields.password)
    .then(() => products.fetchBills(fields.folderPath))
    .catch(helpers.fixErrors)
}
