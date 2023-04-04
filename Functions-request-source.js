// This example shows how to make a decentralized price feed using multiple APIs

// Arguments can be provided when a request is initated on-chain and used in the request source code as shown below
const oracleQueries = JSON.parse(args[0])

// if (
//   secrets.apiKey == "" ||
//   secrets.apiKey === "Your coinmarketcap API key (get a free one: https://coinmarketcap.com/api/)"
// ) {
//   throw Error(
//     "COINMARKETCAP_API_KEY environment variable not set for CoinMarketCap API.  Get a free key from https://coinmarketcap.com/api/"
//   )
// }

// build HTTP request objects
const requests = []
for (let i = 0; i < oracleQueries.length; i++) {
  const query = oracleQueries[i]
  const blockHeight = "0x" + parseInt(query[2]).toString(16)
  console.log(blockHeight)
  const request = Functions.makeHttpRequest({
    url: query[0],
    method: 'POST',
    // Get a free API key from https://coinmarketcap.com/api/
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    data: {
      id: 1,
      jsonrpc: "2.0",
      method: "eth_getBlockByNumber",
      params: [
        blockHeight,
        true
      ]
    }
  })
  requests.push(request)
}

const responses = await Promise.all(requests)

// TODO modify
let results = responses.length.toString() + ","
for (let i = 0; i < responses.length; i++) {
  const response = responses[i]
  console.log(response)
  const query = oracleQueries[i]
  const root = response.data.result.stateRoot
  if (!response.error) {
    results = results + query[1] + "," + query[2] + "," + BigInt(root).toString() + ","
  } else {
    console.log("Response Error")
  }
}
// price * 100 to move by 2 decimals (Solidity doesn't support decimals)
// Math.round() to round to the nearest integer
// Functions.encodeUint256() helper function to encode the result from uint256 to bytes
return Functions.encodeString(JSON.stringify(results))
