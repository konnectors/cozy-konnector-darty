const { requestFactory } = require('cozy-konnector-libs')

const rootUrl = 'https://www.darty.com'

const request = requestFactory({
  cheerio: true,
  jar: true,
  json: false
})

module.exports = {
  rootUrl,
  request
}
