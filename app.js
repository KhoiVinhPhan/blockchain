const express = require('express');
const Web3 = require('web3');
const http = require('http');
const WebSocket = require('ws');
const bodyParser = require('body-parser');
const axios = require('axios');

// Smart contract
const MyContract = require("./artifacts/contracts/Token.sol/Token.json");
const { isAddress } = require('ethers/lib/utils');
const contractABI = MyContract.abi;
const contractAddress = '0x8337c1B662E92c48960e18E9669F4B81EFA83d00'; // Enter your contract address here
const rpcEndpoint = 'https://eth-sepolia.g.alchemy.com/v2/9APS8dPCAa3RSWBuCENXYM-cCUhFevBr'; // url listen 
const fromAddress = '0x3c37F1dB4F1227DE8D6D17c979565D28E6eAF0f9'; // Address wallet account root(tora)
const privateKey = '19eb5600c8c8a54861214071cd58c7e8f64240d18799c1c27d9e8ec45412275e'; // private key of account root (tora)

// stripe config
const stripe = require('stripe')('sk_test_51NESALJWX1TdrUgGUYrULdjYrHqC74jS4iDloa5nleRR8ezHz6nJuThy1ZykBvnaG0Y07UQag1eq966ejIMV1D7u00S7q2xKFE'); // private key of stripe
const endpointSecret = "whsec_3a1d8f618a6631fb6a7fc9c8fdcaa3146ae8aa6c995f173a270ce7af869f64a4"; // key webhook stripe


//Init pakage
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const web3 = new Web3(new Web3.providers.HttpProvider(rpcEndpoint));
const contract = new web3.eth.Contract(contractABI, contractAddress, { from: fromAddress });

// WebSocket connection event
wss.on('connection', (ws) => {
    console.log('Client connected.');
  
    // Message received event
    ws.on('message', (message) => {
      console.log('Received message:', message);
  
      // Handle the message and perform wallet connection logic here
      // For example, you can use the 'web3.js' library to connect to Metamask.
    });
  
    // Connection closed event
    ws.on('close', () => {
      console.log('Client disconnected.');  
    });
});
  
// app.use(express.json());
app.set('view engine', 'ejs'); // Set the view engine to EJS

// Listen notification of stripe
app.post('/stripe-webhook', express.raw({type: 'application/json'}), (request, response) => {
    const sig = request.headers['stripe-signature'];
    try {
        let event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
        if (event.type === 'payment_intent.succeeded') {
            console.log('----- Start call webhook stripe: payment_intent.succeeded -----');

            // Access the metadata from the event object
            const metadata = event.data.object.metadata;
            console.log('Metadata: ', metadata);

            // Access the amount from the PaymentIntent object
            const amount = (event.data.object.amount)/100;
            console.log('Amount: ', amount);

            axios.get(`http://localhost:3000/transfer?addressReceiver=${metadata.addressWallet}&valueToken=${amount}`)
				.then(response => {
                    console.log(response.data.message);
				})
				.catch(error => {
					console.log('error');
				});
        }
        response.send();
    } catch (err) {
        console.log(`Webhook Error: ${err.message}`);
        return;
    }
});


app.get('/', function(req, res){
    // Define the variables to be passed to the template
    const pageTitle = 'TRT (Tora tech)';
    const currentDate = new Date().toDateString();

    // Render the 'index' template with the provided variables
    res.render('index', { pageTitle, currentDate });
});

app.get('/message', async (req, res) => {
    console.log('call API get message');
    const message = await contract.methods.getMessage().call();
    res.json({ message });
});

app.get('/message-sub', async (req, res) => {
    console.log('call API get message-sub');
    const messageSub = await contract.methods.getMessageSub().call();
    res.json({ messageSub });
});

app.get('/balance-of', async (req, res) => {
    console.log('call API get balance-of: /balance-of');
    console.log('Param address: ',req.query.address);
    const balanceOf = await contract.methods.balanceOf(req.query.address).call();
    res.json({ balanceOf : balanceOf/1000000000000000000 });
});

app.get('/name', async (req, res) => {
    console.log('call API get name: /name');
    const name = await contract.methods.name().call();
    res.json({ name });
});

app.get('/symbol', async (req, res) => {
    console.log('call API get symbol: /symbol');
    const symbol = await contract.methods.symbol().call();
    res.json({ symbol });
});

app.get('/transfer', async (req, res) => {
    console.log('-----Call API get transfer token: /transfer-----');

    let amount = web3.utils.toHex(web3.utils.toWei(req.query.valueToken)); //1 DEMO Token
    let data = contract.methods.transfer(req.query.addressReceiver, amount).encodeABI();
    sendErcToken();
    res.json({ message: 'Transfer TRT token success' });

    function sendErcToken() {
        let txObj = {
            gas: web3.utils.toHex(100000),
            "to": contractAddress,
            "value": "0x00",
            "data": data,
            "from": fromAddress
     
        }
        web3.eth.accounts.signTransaction(txObj, privateKey, (err, signedTx) => {
            if (err) {
                return callback(err)
            } else {
                return web3.eth.sendSignedTransaction(signedTx.rawTransaction, (err, res) => {
                    if (err) {
                        console.log(err)
                    } else {
                        console.log(res)
                    }
                })
            }
        })
    }

    console.log('-----End API get transfer token: /transfer-----');
});


app.use(bodyParser.json());
app.post('/payment-coin', async (req, res) => {
    console.log('----- Start call API get: /payment-coin-----');
    let number = req.body.number;
    let amount = req.body.amount;
    let addressWallet = req.body.addressWallet;
    console.log("Number card: " + String(number));
    console.log("Amount: " + amount);
    console.log("Address wallet: " + addressWallet[0]);

    const metadata = {
        addressWallet: addressWallet[0],
    };
    // create payment Methods
    const paymentMethod = await stripe.paymentMethods.create({
        type: 'card',
        card: {
          number: String(number), // Visa card number
          exp_month: 12, // Expiry month
          exp_year: 2024, // Expiry year
          cvc: '123', // CVC number
        },
    });
    const paymentIntent = stripe.paymentIntents.create({
        amount: amount*100, // Amount in cents 1$ = 100cents
        currency: 'usd',
        payment_method: paymentMethod.id,
        confirm: true,
        metadata: metadata
    });
    res.json({ message: 'Payment success' });
    console.log('=> Payment success, please check wallet address: ', addressWallet[0]);
    console.log('----- End call API get: /payment-coin-----');
});
  
  
app.listen(3000, () => {
  console.log('Server listening on port 3000');
});