//@ts-check

const defaultDiagramWidth = 900;
const defaultDiagramHeight = 400;
const network = 'homestead';
const provider = new ethers.providers.FallbackProvider([
  new ethers.providers.EtherscanProvider(network, 'C9KKK6QF3REYE2UKRZKF5GFB2R2FQ5BWRE'),
  new ethers.providers.InfuraProvider(network)
]);
const blockTime = 13.1;
const diagramId = "price-prediction";
const lbpAddress = "0x6428006d00a224116c3e8a4fca72ac9bb7d42327";
const poolAddress = "0xf014fc5d0f02c19d617a30a745ab86a8ca32c92f";
const daiAddress = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const xhdxAddress = "0x6fcb6408499a7c0f242e32d77eb51ffa1dd28a7e";
const graphApi =
  "https://api.thegraph.com/subgraphs/name/balancer-labs/balancer";
const stablecoin = "DAI";

const bucket = 1600;
const params = {
  start: {
    block: 11817006,
    time: 1612800000,
    weights: [37, 3],
    balances: [498362339.302326258, 1250000],
  },
  end: {
    block: 11836793,
    time: 1613059200,
    weights: [7, 33],
  },
};
let balances = params.start.balances;

const series = { data: [] };
const swaps = [];
let init = true;

const priceEl = document.getElementById("price");
const soldEl = document.getElementById("sold");
const raisedEl = document.getElementById("raised");

let weights = [];

const lAbi = [
  {
    "inputs": [],
    "name": "bPool",
    "outputs": [
      {
        "internalType": "contract IBPool",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

const pAbi = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "caller",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "tokenIn",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "tokenOut",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "tokenAmountIn",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "tokenAmountOut",
        "type": "uint256"
      }
    ],
    "name": "LOG_SWAP",
    "type": "event"
  }
];

const currentBucket = () => series.data[series.data.length - 1].time;

function formatMoney(amount, decimalCount = 2, decimal = ".", thousands = ",") {
  try {
    decimalCount = Math.abs(decimalCount);
    decimalCount = isNaN(decimalCount) ? 2 : decimalCount;
    const negativeSign = amount < 0 ? "-" : "";
    let i = parseInt(amount = Math.abs(Number(amount) || 0).toFixed(decimalCount)).toString();
    let j = (i.length > 3) ? i.length % 3 : 0;
    return negativeSign + (j ? i.substr(0, j) + thousands : '') + i.substr(j).replace(/(\d{3})(?=\d)/g, "$1" + thousands) + (decimalCount ? decimal + Math.abs(amount - i).toFixed(decimalCount).slice(2) : "");
  } catch (e) {
    console.log(e)
  }
}

function spotPrice(balances, w, lotSize = 2000, fee = 0.9 / 100) {
  return (
    (balances[1] *
      (Math.pow(balances[0] / (balances[0] - lotSize), w[0] / w[1]) - 1)) /
    (1 - fee) /
    lotSize
  );
}

function saleRate(bounded = 0, lastBuckets = 10) {
  const currentBucket = series.data[series.data.length - 1].time;
  const calculated = -1 * swaps.filter(s => s.timestamp + bucket * 10 > currentBucket)
      .reduce((a, { deltas }) => a + deltas[0], 0) / lastBuckets;
  const max = (params.start.balances[0] * bounded - (params.start.balances[0] - balances[0])) / ((params.end.time - currentBucket) / bucket);
  return bounded ? Math.min(max, calculated) : calculated;
}

async function getLatestPrice() {
  const abi = [
    "function getSpotPrice(address tokenIn, address tokenOut) view returns (uint)",
  ];
  const pool = new ethers.Contract(poolAddress, abi, provider);
  const rawPrice = await pool.getSpotPrice(daiAddress, xhdxAddress);
  const price = Number.parseFloat(
    ethers.utils.formatUnits(rawPrice, 24)
  );
  return Number(price);
}

async function fetchPool() {
  return fetch(graphApi, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `
                query {
                  pools(where: {id: "${poolAddress}"}) {
                    swapsCount,
                    tokens {
                      symbol
                      balance
                      denormWeight
                    },
                    holdersCount
                  }
                }
            `,
    }),
  })
    .then((res) => res.json())
    .then((res) => res.data.pools[0]);
}

async function fetchSwaps(skip = 0) {
  return fetch(graphApi, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `
                query {
                  pools(where: {id: "${poolAddress}"}) {
                    swaps(first: 1000, skip: ${skip}, orderBy: timestamp, orderDirection: asc) {
                      timestamp
                      id
                      tokenIn
                      tokenInSym
                      tokenAmountIn
                      tokenOut
                      tokenOutSym
                      tokenAmountOut
                      userAddress {
                        id
                      }
                    }
                  }
                }
            `,
    }),
  })
    .then((res) => res.json())
    .then((res) => res.data.pools[0].swaps.map(calculateSwap));
}

function calculateSwap(swap) {
  const tokenAmountIn = Number(swap.tokenAmountIn);
  const tokenAmountOut = Number(swap.tokenAmountOut);
  let price, deltas;
  if (swap.tokenInSym === stablecoin) {
    price = tokenAmountIn / tokenAmountOut;
    deltas = [-tokenAmountOut, tokenAmountIn];
  } else {
    price = tokenAmountOut / tokenAmountIn;
    deltas = [tokenAmountIn, -tokenAmountOut];
  }
  return { ...swap, price, deltas };
}

async function fetchAllSwaps(count) {
  let i = 0;
  let calls = [];
  do {
    calls.push(fetchSwaps(i));
    i += 1000;
  } while (i < count);
  return Promise.all(calls).then((calls) => calls.flat());
}

function predictPrice(rate = 0) {
  const swaps = series.data;
  const lastSwap = swaps[swaps.length - 1];
  const { time } = lastSwap || params.start;
  const b = [...balances];
  let over = false;
  const { close } = lastSwap || { close: spotPrice(b, params.start.weights) };
  const future = [{ time, value: close }];
  for (let i = time + bucket; i < params.end.time; i += bucket) {
    let price = spotPrice(b, weights[i]);
    if (price > close * 2) {
      price = undefined;
      over = true;
    }
    future.push({ time: i, value: price });
    if (rate) {
      b[0] -= rate;
      b[1] += rate * spotPrice(b, weights[i], rate);
    }
  }
  return future;
}

function updatePrice(swap) {
  const { timestamp, price, deltas } = swap;
  const bar = series.data[series.data.length - 1];
  if (!bar || timestamp >= bar.time + bucket) {
    const newBar = {};
    newBar.open = bar ? bar.close : price;
    newBar.high = price;
    newBar.low = price;
    newBar.close = price;
    newBar.time = bar ? bar.time + bucket : timestamp;
    series.data.push(newBar);
    series.candle.setData(series.data);
  } else {
    bar.close = price;
    bar.high = Math.max(bar.high, price);
    bar.low = Math.min(bar.low, price);
    series.candle.update(bar);
  }
  balances = balances.map((b, i) => b + deltas[i]);
  swaps.push(swap);
  priceEl.innerHTML = `${price.toFixed(4)} DAI`;
  soldEl.innerHTML = `${Math.round((params.start.balances[0]-balances[0])/params.start.balances[0]*100)}% xHDX sold`;
  raisedEl.innerHTML = `${formatMoney(balances[1] - params.start.balances[1], 0)} DAI raised`;
  if (!init) {
    const predict = new URLSearchParams(window.location.search).get('predict');
    if (predict) {
      const bound = Number(predict);
      series.predicted.setData(predictPrice(saleRate(bound || 0.86)));
    }
    series.worstCase.setData(predictPrice());
  }
}

async function refreshTime() {
  const now = moment().unix();
  const currentBlock = await provider.getBlock('latest');
  const timeOfBlock = async block => block > currentBlock.number
      ? currentBlock.timestamp + Math.round((block - currentBlock.number) * blockTime)
      : (await provider.getBlock(block)).timestamp;
  [params.start.time, params.end.time] = await Promise.all([timeOfBlock(params.start.block), timeOfBlock(params.end.block)]);
  const startIn = moment.duration(params.start.time - now, 'seconds');
  const endIn = moment.duration(params.end.time - now, 'seconds');
  console.log('ends in', `${endIn.hours()} hours ${endIn.minutes()} minutes ${endIn.seconds()} seconds`);
  document.getElementsByClassName('start')[0].innerHTML = startIn > 0 ? `start in ${startIn.humanize()}` : 'started';
  document.getElementsByClassName('end')[0].innerHTML = endIn > 0 ? `end in ${endIn.humanize()}` : 'ended';
}

async function main() {
  await refreshTime();
  weights = (() => {
    const start = params.start.weights;
    const end = params.end.weights;
    let time = params.start.time;
    const res = {
      [time]: start,
      [params.end.time]: end,
    };
    const steps = Math.ceil((params.end.time - params.start.time) / bucket);
    for (let i = 1; i < steps; i++) {
      time += bucket;
      res[time] = [
        start[0] - (i / steps) * (start[0] - end[0]),
        start[1] + (i / steps) * (end[1] - start[1]),
      ];
    }
    return res;
  })();

  let chartWidth = defaultDiagramWidth;
  let chartHeight = defaultDiagramHeight;

  if (document.scrollingElement.clientWidth - 32 < defaultDiagramWidth) {
    chartWidth = document.scrollingElement.clientWidth - 32;
    chartHeight =
      ((document.scrollingElement.clientWidth - 32) * defaultDiagramHeight) /
      (defaultDiagramWidth - 32);
  }

  const resize = () => {
    if (document.scrollingElement.clientWidth - 32 < defaultDiagramWidth) {
      chart.applyOptions({
        width: document.scrollingElement.clientWidth - 32,
        height:
          ((document.scrollingElement.clientWidth - 32) *
            defaultDiagramHeight) /
          (defaultDiagramWidth - 32),
      });
    } else {
      chart.applyOptions({
        width: defaultDiagramWidth,
        height: defaultDiagramHeight,
      });
    }
  };

  const chart = LightweightCharts.createChart(
    document.getElementById(diagramId),
    {
      width: chartWidth,
      height: chartHeight,
      handleScroll: false,
      handleScale: false,
      localization: {
        priceFormatter: price => price.toFixed(4),
        timeFormatter: timestamp => moment.unix(timestamp).format('D.M. H:mm')
      },
      layout: {
        textColor: "#F653A2",
        backgroundColor: "#0D106E",
      },
      timeScale: {
        lockVisibleTimeRangeOnResize: true,
        timeVisible: true,
        barSpacing: 1,
      },
      priceScale: {
        scaleMargins: {
          top: 0.1,
          bottom: 0,
        },
      },
      grid: {
        vertLines: {
          color: "transparent",
        },
        horzLines: {
          color: "transparent",
        },
      },
    }
  );

  series.chart = chart;

  series.candle = chart.addCandlestickSeries({
    upColor: "#5EAFE1",
    wickUpColor: "#5EAFE1",
    downColor: "#F653A2",
    wickDownColor: "#F653A2",
    borderVisible: false,
    wickVisible: true,
  });

  series.worstCase = chart.addLineSeries({
    lineStyle: 1,
    priceLineVisible: false,
    lastValueVisible: false,
    color: "#F653A2",
    lineWidth: 2,
  });

  series.predicted = chart.addLineSeries({
    lineStyle: 1,
    priceLineVisible: false,
    lastValueVisible: false,
    color: "#5EAFE1",
    lineWidth: 2,
  });

  resize();

  window.addEventListener("resize", () => {
    resize();
  });

  const pool = await fetchPool();
  const [swaps, lastPrice] = await Promise.all([
      fetchAllSwaps(Number(pool.swapsCount)),
      null //getLatestPrice()
  ]);
  console.log(swaps, lastPrice);
  const past = swaps.filter(s => s.timestamp >= params.start.time);
  if (past.length) {
    let last = past.pop();
    past.map(updatePrice);
    init = false;
    updatePrice(last);
  } else {
    updatePrice({
      timestamp: params.start.time,
      price: spotPrice(balances, params.start.weights),
      deltas: [0, 0],
    });
  }
  // final price hardcoded
  updatePrice({
    timestamp: params.start.time,
    price: 0.0806,
    deltas: [0, 0],
  });
  const now = moment().unix();
  if (lastPrice && now >= params.start.time) {
    updatePrice({
      timestamp: now,
      price: lastPrice,
      deltas: [0, 0],
    });
  }
  series.chart.timeScale().setVisibleRange({
    from: params.start.time,
    to: params.end.time,
  });
  resize();

  const lbp = new ethers.Contract(lbpAddress, lAbi, provider);
  const bpool = new ethers.Contract(poolAddress, pAbi, provider);
  lbp.on({topics: ['0xe211b87500000000000000000000000000000000000000000000000000000000'] }, async () => {
    console.log('poked!');
    updatePrice({
      timestamp: moment().unix(),
      price: await getLatestPrice(),
      deltas: [0, 0]
    })
  })
  bpool.on('LOG_SWAP', async (id, tokenIn, tokenOut, tokenAmountIn, tokenAmountOut, { blockNumber }) => {
    const [tokenInSym, tokenOutSym] = [tokenIn, tokenOut]
        .map(token => token.toLowerCase() === daiAddress.toLowerCase() ? 'DAI' : 'xHDX');
    if (tokenIn.toLowerCase() === daiAddress.toLowerCase()) {
      [tokenAmountIn, tokenAmountOut] = [
        ethers.utils.formatUnits(tokenAmountIn),
        ethers.utils.formatUnits(tokenAmountOut, 12)
      ];
    } else {
      [tokenAmountIn, tokenAmountOut] = [
        ethers.utils.formatUnits(tokenAmountIn, 12),
        ethers.utils.formatUnits(tokenAmountOut)
      ];
    }
    let timestamp;
    try {
      timestamp = (await provider.getBlock(blockNumber)).timestamp || moment().unix();
    } catch (e) {
      timestamp = moment().unix();
    }
    const swap = calculateSwap({
      userAddress: { id },
      timestamp,
      tokenIn,
      tokenOut,
      tokenInSym,
      tokenOutSym,
      tokenAmountIn,
      tokenAmountOut
    });
    console.log('swap!', swap.deltas);
    updatePrice(swap);
  });
  setInterval(refreshTime, 20000);
}

main();
