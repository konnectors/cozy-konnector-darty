const { log, saveBills, cozyClient } = require('cozy-konnector-libs')
const { rootUrl, request } = require('./request')
const helpers = require('./helpers')
const sleep = require('util').promisify(global.setTimeout)

const tableUrl = rootUrl + '/webapp/wcs/stores/controller/ec/products/table'
const generateBillUrl =
  rootUrl + '/webapp/wcs/stores/controller/FactureMagasinGeneration'
const billPath = '/webapp/wcs/stores/controller/'

const firstPageNum = 1

module.exports = {
  fetchBills
}

function fetchBills(folderPath) {
  return fetchPagesCount()
    .then(count => fetchPages(count, folderPath))
    .then(products => fetchBillFiles(products, folderPath))
}

function fetchPagesCount() {
  return requestTable(firstPageNum).then(parsePagesCount)
}

function parsePagesCount($) {
  const lastPageString = $('a[data-page]')
    .last()
    .data('page')

  return lastPageString ? parseInt(lastPageString) : firstPageNum
}

async function fetchPages(pagesCount, folderPath) {
  log('info', `Found ${pagesCount} product page(s).`)

  let products = []
  for (let pageNum = firstPageNum; pageNum <= pagesCount; pageNum++) {
    const foundProducts = await fetchPageAndGenerateBillsIfNeeded(
      pageNum,
      folderPath
    )
    products = products.concat(foundProducts)
  }

  return products
}

async function filterNonExistingProductsInCozy(products, folderPath) {
  let result = []
  for (let product of products) {
    const bill = billEntry(product)

    try {
      await cozyClient.files.statByPath(folderPath + '/' + bill.filename)
    } catch (err) {
      result.push(product)
    }
  }
  return result
}

async function fetchPageAndGenerateBillsIfNeeded(pageNum, folderPath) {
  let products = await fetchPage(pageNum)
  let productsToGenerate = products.filter(p => p.generateData)
  const newProducts = await filterNonExistingProductsInCozy(
    productsToGenerate,
    folderPath
  )
  log(
    'info',
    `Found ${newProducts.length} products pdf on page ${pageNum} to generate`
  )

  if (newProducts.length) {
    await generateProductsPdfs(newProducts)
    await sleep(10000)
    products = await fetchPage(pageNum)
    productsToGenerate = products.filter(p => p.generateDate)
    if (productsToGenerate.length) {
      log(
        'warn',
        `Still ${productsToGenerate.length} products pdf on page ${pageNum} to generate...`
      )
    }
  }

  return products
}

async function fetchPage(pageNum) {
  return requestTable(pageNum).then($ => parseTable(pageNum, $))
}

async function requestTable(pageNum) {
  const options = {
    url: tableUrl,
    qs: {
      filtre: '0',
      pagination: pageNum.toString()
    }
  }
  return request(options)
}

async function generateProductsPdfs(products) {
  for (const product of products) {
    const data = product.generateData
    const options = {
      url: generateBillUrl,
      qs: {
        numCmd: data.num,
        placeOrderTime: data.time,
        token: data.token
      }
    }
    log('info', `Generating pdf for product : ${product.description}`)
    await request.post(options)
  }
}

function parseTable(pageNum, $) {
  log('info', `Parsing products page ${pageNum}...`)

  const products = $('.item_product')
    .map((_, elem) => {
      const result = parseRow($(elem))
      result.$ = $
      return result
    })
    .get()

  return products
}

function parseRow($elem) {
  // Most information is available as `data-*` attributes
  const product = $elem.data()

  // Product description is a link to the product page
  product.description = $elem.find('a[href^="/nav/codic/"]').text()

  // Products with a *Download bill* button will have `billPath` set.
  // Products without a *Download bill* button will have `billPath` undefined.
  product.billPath = $elem.find('a[data-tracking="bill-product"]').attr('href')

  const aWithToken = $elem.find('a[data-token]')
  if (aWithToken.length) {
    product.generateData = aWithToken.data()
  }

  return product
}

function fetchBillFiles(products, folderPath) {
  products = keepWhenBillAvailable(products)
  log('info', `Downloading ${products.length} bill(s)...`)
  return helpers.mkdirp(folderPath).then(() => {
    const billEntries = products.map(billEntry)
    return saveBills(billEntries, folderPath, {
      identifiers: ['darty']
    })
  })
}

function keepWhenBillAvailable(products) {
  // When `billPath` is `undefined`, `"#"` or `"/achat/contacts/index.html"`,
  // bill is either unavailable or can only be sent by email.
  return products.filter(p => p.billPath && p.billPath.startsWith(billPath))
}

function billEntry(product) {
  const { date, isoDateString } = helpers.parseFrenchDate(product.omnitureDate)

  return {
    amount: helpers.parseAmount(product.omniturePrix),
    date,
    // Prefix filename with ISO-like date to get sensible default order.
    // Also include product description to help user identify its bills.
    filename: helpers.normalizeFilename(
      `${isoDateString}-${product.description}.pdf`
    ),
    fileurl: rootUrl + product.billPath,
    vendor: 'Darty'
  }
}
