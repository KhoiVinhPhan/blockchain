const express = require('express');
const Web3 = require('web3');
const http = require('http');
const WebSocket = require('ws');
const bodyParser = require('body-parser');
const axios = require('axios');
const Pusher = require("pusher");
const Tx = require('ethereumjs-tx').Transaction;

// Smart contract
const MyContract = require("./artifacts/contracts/Token.sol/Token.json");
const { isAddress } = require('ethers/lib/utils');
const contractABI = MyContract.abi;
const contractAddress = '0xa0aE7aa1768aa12C67003914eFC24b99aEdFD2b3'; // Enter your contract address here
const rpcEndpoint = 'https://eth-sepolia.g.alchemy.com/v2/9APS8dPCAa3RSWBuCENXYM-cCUhFevBr'; // url listen 
const rootAddressWallet = "0xa9c682a9f1c6de6e09fac43dcfecc6fcc41c4087"; // Address wallet account root(tora)
const privateKey = '52da2c4e7ad4c58cd693f5e9f4aa6408d388529365c08514203ae446e0e23384'; // private key of account root (tora)
const decimals = 18;

// stripe config
const stripe = require('stripe')('sk_test_51NESALJWX1TdrUgGUYrULdjYrHqC74jS4iDloa5nleRR8ezHz6nJuThy1ZykBvnaG0Y07UQag1eq966ejIMV1D7u00S7q2xKFE'); // private key of stripe
const endpointSecret = "whsec_3a1d8f618a6631fb6a7fc9c8fdcaa3146ae8aa6c995f173a270ce7af869f64a4"; // key webhook stripe

// pusher config
const pusher = new Pusher({
    appId: "1614951",
    key: "cf2d8ddd49b9307e093e",
    secret: "182d3b2414f5c8b87869",
    cluster: "ap1",
    useTLS: true
});

//Init pakage
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const web3 = new Web3(new Web3.providers.HttpProvider(rpcEndpoint));
// const web3 = new Web3(rpcEndpoint);
const contract = new web3.eth.Contract(contractABI, contractAddress, { from: rootAddressWallet });

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
app.post('/stripe-webhook', express.raw({ type: 'application/json' }), (request, response) => {
    console.log('----- Start call api: /stripe-webhook -----');
    const sig = request.headers['stripe-signature'];
    try {
        let event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
        if (event.type === 'payment_intent.succeeded') {
            // Access the metadata from the event object
            const metadata = event.data.object.metadata;
            console.log('Metadata: ', metadata);

            // Access the amount from the PaymentIntent object
            const amount = (event.data.object.amount) / 100;
            console.log('Amount: ', amount);


            const params = {
                addressReceiver: metadata.addressWallet,
                valueToken: amount,
            };

            axios.post('http://localhost:3000/mint-transfer', params)
                .then(response => {
                    const data = response.data;
                })
                .catch(error => {
                    console.error(error);
                });



            // axios.get(`http://localhost:3000/transfer?addressReceiver=${metadata.addressWallet}&valueToken=${amount}`)
            //     .then(response => {
            //         console.log(response.data.message);
            //     })
            //     .catch(error => {
            //         console.log('error', error);
            //     });
        }
        response.send();
        console.log('----- End call api: /stripe-webhook -----');
    } catch (err) {
        console.log(`Webhook Error: ${err.message}`);
        return;
    }
});


app.get('/', function (req, res) {
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

// Get balance of address wallet
app.get('/balance-of', async (req, res) => {
    console.log('call API get balance-of: /balance-of');
    console.log('Param address: ', req.query.address);
    const balanceOf = await contract.methods.balanceOf(req.query.address).call();
    res.json({ balanceOf: balanceOf / 1000000000000000000 });
});

// Get token name
app.get('/name', async (req, res) => {
    console.log('call API get name: /name');
    const name = await contract.methods.name().call();
    res.json({ name });
});

// Get token symbol
app.get('/symbol', async (req, res) => {
    console.log('call API get symbol: /symbol');
    const symbol = await contract.methods.symbol().call();
    res.json({ symbol });
});

// Get token allowance
app.get('/allowance', async (req, res) => {
    console.log('----- Start call API: /allowance -----');
    let spenderAddress = req.query.address;
    contract.methods.allowance(spenderAddress, rootAddressWallet).call()
        .then((allowance) => {
            console.log('Allowance:', allowance);
            console.log('----- End call API: /allowance -----');
            res.json({ allowance: allowance / 1000000000000000000 });
        })
        .catch((error) => {
            console.error('Check allowance error:', error);
        });
});

// Get token total supply
app.get('/total-supply', async (req, res) => {
    console.log('call API get: /total-supply');
    const totalSupply = await contract.methods.totalSupply().call();
    res.json({ totalSupply: totalSupply / 1000000000000000000 });
});

app.get('/transfer', async (req, res) => {
    console.log('----- Start API get transfer token: /transfer-----');

    // ------------------- transfer ---------------------
    let amount = web3.utils.toHex(web3.utils.toWei(req.query.valueToken));
    let transferMethod = contract.methods.transfer(req.query.addressReceiver, amount);
    // Tạo đối tượng giao dịch transfer
    const transferTxObject = {
        gasLimit: web3.utils.toHex(100000),
        gasPrice: web3.utils.toHex(web3.utils.toWei('10', 'gwei')),
        to: contractAddress,
        from: rootAddressWallet,
        data: transferMethod.encodeABI()
    };

    // Ký giao dịch transfer
    console.log('Ký giao dịch transfer');
    web3.eth.accounts.signTransaction(transferTxObject, privateKey)
        .then((signedTransferTx) => {
            // Gửi giao dịch transfer đã ký
            console.log('Gửi giao dịch transfer đã ký');
            web3.eth.sendSignedTransaction(signedTransferTx.rawTransaction)
                .on('transactionHash', (transferHash) => {
                    console.log('Transfer transaction hash:', transferHash);

                })
                .on('receipt', (transferReceipt) => {
                    console.log('Transfer transaction receipt:', transferReceipt);

                    // res.status(200).json({ status: true });
                    console.log('-----End API get transfer token: /transfer-----');
                })
                .on('error', (error) => {
                    console.error('Transfer transaction error:', error);
                });
        })
        .catch((error) => {
            console.error('Sign transfer transaction error:', error);
        });
    // ------------------- transfer ---------------------
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
        amount: amount * 100, // Amount in cents 1$ = 100cents
        currency: 'usd',
        payment_method: paymentMethod.id,
        confirm: true,
        metadata: metadata
    });
    res.json({ message: 'Payment success' });
    console.log('=> Payment success, please check wallet address: ', addressWallet[0]);
    console.log('----- End call API get: /payment-coin-----');
});

// Mint and transfer token
app.post('/mint-transfer', async (req, res) => {
    console.log('-----Call API get transfer token: /mint-transfer-----');
    let addressReceiver = req.body.addressReceiver;
    let valueToken = req.body.valueToken;
    let amount = web3.utils.toHex(web3.utils.toWei(valueToken.toString()));

    // start mint token
    const mintMethod = contract.methods.mint(rootAddressWallet, amount);
    web3.eth.accounts.signTransaction(
        {

            gasLimit: web3.utils.toHex(100000),
            gasPrice: web3.utils.toHex(web3.utils.toWei('10', 'gwei')),
            to: contractAddress,
            from: rootAddressWallet,
            data: mintMethod.encodeABI()
        },
        privateKey
    )
        .then((signedTx) => {
            web3.eth.sendSignedTransaction(signedTx.rawTransaction)
                .on('receipt', (receipt) => { // Mint success
                    console.log('Mint success: ', receipt);
                    console.log("Start transfer method");

                    // start transfer token
                    let transferMethod = contract.methods.transfer(addressReceiver, amount).encodeABI();
                    let txObj = {
                        gasLimit: web3.utils.toHex(100000),
                        gasPrice: web3.utils.toHex(web3.utils.toWei('10', 'gwei')),
                        to: contractAddress,
                        from: rootAddressWallet,
                        data: transferMethod
                    }
                    web3.eth.accounts.signTransaction(txObj, privateKey)
                        .then((signedTx) => {
                            web3.eth.sendSignedTransaction(signedTx.rawTransaction)
                                .on('transactionHash', (transferHash) => {
                                    console.log('Transfer transaction hash:', transferHash);
                                })
                                .on('receipt', (receipt) => {
                                    console.log("Transfer success", receipt);

                                    //Notification
                                    pusher.trigger(`buy-token-channel-${addressReceiver}`, `buy-token-event-${addressReceiver}`, {
                                        message: `You have received ${valueToken} TRT tokens`
                                    })
                                        .then(() => {
                                            console.log('Pusher event triggered successfully');
                                            // res.status(200).json({ message: 'Pusher event triggered successfully' });
                                        })
                                        .catch((error) => {
                                            console.log('Error');
                                            // res.status(500).json({ error: 'Internal server error' });
                                        });

                                    res.status(200).json({ status: true });
                                })
                                .on('error', (error) => {
                                    console.error('Error transfer', error);
                                });

                        })
                        .catch((error) => {
                            console.error('Sign approve transaction error:', error);
                        });
                    // end transfer token
                })
                .on('error', (error) => {
                    console.error('Lỗi giao dịch mint:', error);
                });
        })
        .catch((error) => {
            console.error('Lỗi khi ký giao dịch mint:', error);
        });
    // end mint token

    function notification() {
        //res.json({ message: 'Transfer TRT token success, please check wallet' });
        // start pusher
        pusher.trigger('my-channel', 'my-event', {
            message: 'message of vinh khoi'
        })
            .then(() => {
                console.log('Pusher event triggered successfully');
                console.log('-----End API get transfer token: /mint-transfer-----');
                // res.status(200).json({ message: 'Pusher event triggered successfully' });
            })
            .catch((error) => {
                console.log('Error');
                console.log('-----End API get transfer token: /mint-transfer-----');
                // res.status(500).json({ error: 'Internal server error' });
            });
        // end pusher

    }

});

// pusher
app.post('/trigger-event', (req, res) => {
    const message = req.body.message;
    console.log(message);

    let amount = web3.utils.toHex(web3.utils.toWei('1000')); //1 DEMO Token
    let data = contract.methods.transfer('address-wallet', amount).encodeABI();
    sendErcToken();
    res.json({ message: 'Transfer TRT token success' });

    function sendErcToken() {
        let txObj = {
            gas: web3.utils.toHex(100000),
            "to": contractAddress,
            "value": "0x00",
            "data": data,
            "from": rootAddressWallet

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

    pusher.trigger('my-channel', 'my-event', {
        message: message
    })
        .then(() => {
            res.status(200).json({ message: 'Pusher event triggered successfully' });
        })
        .catch((error) => {
            console.log('Error');
            res.status(500).json({ error: 'Internal server error' });
        });
});

app.post('/approve', async (req, res) => {
    console.log('----- Start call API: /approve -----');
    // const { spender, amount } = req.body;
    // console.log(spender);
    // console.log(amount);

    const spender = req.body.spender;
    const amount = web3.utils.toHex(web3.utils.toWei('10000'));
    console.log('amount', amount);

    // Create the approval transaction data
    const approvalData = contract.methods.approve('address-wallet', amount).encodeABI();

    // Get the account's nonce
    const nonce = await web3.eth.getTransactionCount(rootAddressWallet);

    // Build the transaction object
    const txObject = {
        from: rootAddressWallet,
        to: contractAddress,
        gas: 200000,
        gasPrice: web3.utils.toWei('10', 'gwei'), // Adjust the gas price as needed
        data: approvalData,
        nonce: nonce,
        value: "0x00",
    };

    // Sign the transaction
    const signedTx = await web3.eth.accounts.signTransaction(txObject, privateKey);
    console.log('SignTransaction processing ...');
    console.log('Information: ', signedTx);

    // Send the signed transaction
    const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    console.log('sendSignedTransaction processing ...');
    console.log('Transaction receipt:', receipt);


    console.log('----- End call API: /approve -----');
    // return txReceipt;

});

app.post('/increase-allownce', async (req, res) => {
    console.log('----- Start call API: /increase-allownce -----');
    // const { spender, amount } = req.body;
    // console.log(spender);
    // console.log(amount);

    const spender = req.body.spender;
    const amount = '1000';

    // Create the IncreaseAllowance transaction data
    const contractIncreaseAllowance = contract.methods.increaseAllowance(spender[0], amount).encodeABI();

    // Get the account's nonce
    const nonce = await web3.eth.getTransactionCount(rootAddressWallet);

    // Build the transaction object
    const txObject = {
        from: rootAddressWallet,
        to: contractAddress,
        gas: 200000, // Adjust the gas limit as needed
        gasPrice: web3.utils.toWei('10', 'gwei'), // Adjust the gas price as needed
        data: contractIncreaseAllowance,
        nonce: nonce
    };

    // Sign the transaction
    const signedTx = await web3.eth.accounts.signTransaction(txObject, privateKey);
    console.log('SignTransaction processing ...');
    console.log('Information: ', signedTx);

    // Send the signed transaction
    const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    console.log('SendSignedTransaction processing ...');
    console.log('Giao dịch increaseAllowance đã được gửi:', receipt);

    console.log('----- End call API: /increase-allownce -----');

    // return txReceipt;

});

app.post('/transfer-from', async (req, res) => {
    console.log('----- Start call API: /transfer-from -----');
    try {
        const sourceAddress = '0x3c37f1db4f1227de8d6d17c979565d28e6eaf0f9';
        const spenderAddress = '0x7019c9b19f4485b516b1d8c34c621fd0325cab84';
        const recipientAddress = '0xa66eb11a3029044aa564adbb1d744cd97b8ffaa4';
        const amount = web3.utils.toHex(web3.utils.toWei('1000'));

        // Tạo giao dịch approve
        console.log('Tạo giao dịch approve');
        const approveData = contract.methods.approve(spenderAddress, amount).encodeABI();
        const approveTxCount = await web3.eth.getTransactionCount(sourceAddress);
        const approveTxObject = {
            nonce: web3.utils.toHex(approveTxCount),
            gasLimit: web3.utils.toHex(500000),
            gasPrice: web3.utils.toHex(web3.utils.toWei('10', 'gwei')),
            to: contractAddress,
            from: sourceAddress,
            data: approveData
        };
        const signedApproveTx = await web3.eth.accounts.signTransaction(approveTxObject, privateKey);
        console.log('signedApproveTx: ', signedApproveTx);
        const approveTxReceipt = await web3.eth.sendSignedTransaction(signedApproveTx.rawTransaction);
        console.log('Approve Transaction Receipt:', approveTxReceipt);

        // Tạo giao dịch transferFrom
        console.log('Tạo giao dịch transferFrom');
        const transferFromData = contract.methods.transferFrom(spenderAddress, sourceAddress, amount).encodeABI();
        const transferFromTxCount = await web3.eth.getTransactionCount(sourceAddress);
        const transferFromTxObject = {
            nonce: web3.utils.toHex(transferFromTxCount),
            gasLimit: web3.utils.toHex(500000),
            gasPrice: web3.utils.toHex(web3.utils.toWei('10', 'gwei')),
            to: contractAddress,
            from: spenderAddress,
            data: transferFromData
        };
        const signedTransferFromTx = await web3.eth.accounts.signTransaction(transferFromTxObject, privateKey);
        console.log('signedTransferFromTx: ', signedTransferFromTx);
        const transferFromTxReceipt = await web3.eth.sendSignedTransaction(signedTransferFromTx.rawTransaction);
        console.log('TransferFrom Transaction Receipt:', transferFromTxReceipt);

        console.log('Transfer successful');
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
    console.log('----- End call API: /transfer-from -----');

});

app.post('/approve-transfer', async (req, res) => {
    // const { spender, amount } = req.body;
    // console.log(spender);
    // console.log(amount);

    // Địa chỉ người nhận
    const toAddress = '0xdf40fa9834bf5e080843dcb9a3dc5e60a707397d';

    // Địa chỉ người được ủy quyền
    const approvedAddress = '0x35755b2c2e2b97061f3401185a2ed55960eb4b6d';

    // Số lượng token được ủy quyền
    const approvedAmount = web3.utils.toHex(web3.utils.toWei('10000'));

    // Khởi tạo phương thức approve để ủy quyền số lượng token
    const approveMethod = contract.methods.approve(approvedAddress, approvedAmount);

    // Khởi tạo phương thức transferFrom với các tham số tương ứng
    const transferFromMethod = contract.methods.transferFrom(approvedAddress, rootAddressWallet, approvedAmount);

    const transferMethod = contract.methods.transfer(toAddress, web3.utils.toHex(web3.utils.toWei('7000')));

    // Lấy thông tin gas price hiện tại
    web3.eth.getGasPrice()
        .then((gasPrice) => {
            const gasPriceHex = web3.utils.toHex(gasPrice);

            // Lấy số nonce hiện tại của địa chỉ nguồn
            web3.eth.getTransactionCount(rootAddressWallet)
                .then((nonce) => {
                    const nonceHex = web3.utils.toHex(nonce);

                    // Lấy gas limit ước tính cho giao dịch approve
                    approveMethod.estimateGas({ from: rootAddressWallet })
                        .then((gasLimit) => {
                            const gasLimitHex = web3.utils.toHex(gasLimit);
                            // Tạo đối tượng giao dịch approve
                            const approveTxObject = {
                                nonce: nonceHex,
                                gasLimit: web3.utils.toHex(500000),
                                gasPrice: web3.utils.toHex(web3.utils.toWei('10', 'gwei')),
                                to: contractAddress,
                                from: rootAddressWallet,
                                data: approveMethod.encodeABI()
                            };

                            // Ký giao dịch approve
                            console.log('Ký giao dịch approve');
                            web3.eth.accounts.signTransaction(approveTxObject, privateKey)
                                .then((signedApproveTx) => {
                                    // Gửi giao dịch approve đã ký
                                    console.log('Gửi giao dịch approve đã ký');
                                    web3.eth.sendSignedTransaction(signedApproveTx.rawTransaction)
                                        .on('transactionHash', (hash) => {
                                            console.log('Approve transaction hash:', hash);
                                            // -> Sau khi giao dịch approve được gửi thành công, tiến hành gửi giao dịch transferFrom

                                            //Notification
                                            pusher.trigger(`buy-course-channel-${rootAddressWallet}`, `buy-course-event-${rootAddressWallet}`, {
                                                message: 'processing...'
                                            })
                                                .then(() => {
                                                    console.log('Pusher event triggered successfully');
                                                    // res.status(200).json({ message: 'Pusher event triggered successfully' });
                                                })
                                                .catch((error) => {
                                                    console.log('Error');
                                                    // res.status(500).json({ error: 'Internal server error' });
                                                });
                                        })
                                        .on('receipt', (approveReceipt) => {
                                            console.log('Approve transaction receipt:', approveReceipt);

                                            // Tạo đối tượng giao dịch transferFrom
                                            const transferFromTxObject = {
                                                gasLimit: web3.utils.toHex(500000),
                                                gasPrice: web3.utils.toHex(web3.utils.toWei('10', 'gwei')),
                                                to: contractAddress,
                                                from: approvedAddress,
                                                data: transferFromMethod.encodeABI()
                                            };

                                            // Ký giao dịch transferFrom
                                            console.log('Ký giao dịch transferFrom');
                                            web3.eth.accounts.signTransaction(transferFromTxObject, privateKey)
                                                .then((signedTransferFromTx) => {
                                                    // Gửi giao dịch transferFrom đã ký
                                                    console.log('Gửi giao dịch transferFrom đã ký');
                                                    web3.eth.sendSignedTransaction(signedTransferFromTx.rawTransaction)
                                                        .on('transactionHash', (transferFromHash) => {
                                                            console.log('TransferFrom transaction hash:', transferFromHash);
                                                        })
                                                        .on('receipt', (transferFromReceipt) => {
                                                            console.log('TransferFrom transaction receipt:', transferFromReceipt);
                                                            //Notification
                                                            pusher.trigger(`buy-course-channel-${rootAddressWallet}`, `buy-course-event-${rootAddressWallet}`, {
                                                                message: 'Done!'
                                                            })
                                                                .then(() => {
                                                                    console.log('Pusher event triggered successfully');
                                                                    // res.status(200).json({ message: 'Pusher event triggered successfully' });
                                                                })
                                                                .catch((error) => {
                                                                    console.log('Error');
                                                                    // res.status(500).json({ error: 'Internal server error' });
                                                                });

                                                            // ------------------- transfer ---------------------
                                                            // Tạo đối tượng giao dịch transfer
                                                            const transferTxObject = {
                                                                gasLimit: web3.utils.toHex(100000),
                                                                gasPrice: web3.utils.toHex(web3.utils.toWei('10', 'gwei')),
                                                                to: contractAddress,
                                                                from: rootAddressWallet,
                                                                data: transferMethod.encodeABI()
                                                            };

                                                            // Ký giao dịch transfer
                                                            console.log('Ký giao dịch transfer');
                                                            web3.eth.accounts.signTransaction(transferTxObject, privateKey)
                                                                .then((signedTransferTx) => {
                                                                    // Gửi giao dịch transfer đã ký
                                                                    console.log('Gửi giao dịch transfer đã ký');
                                                                    web3.eth.sendSignedTransaction(signedTransferTx.rawTransaction)
                                                                        .on('transactionHash', (transferHash) => {
                                                                            console.log('Transfer transaction hash:', transferHash);
                                                                            //Notification
                                                                            pusher.trigger(`buy-course-channel-${toAddress}`, `buy-course-event-${toAddress}`, {
                                                                                message: 'processing...'
                                                                            })
                                                                                .then(() => {
                                                                                    console.log('Pusher event triggered successfully');
                                                                                    // res.status(200).json({ message: 'Pusher event triggered successfully' });
                                                                                })
                                                                                .catch((error) => {
                                                                                    console.log('Error');
                                                                                    // res.status(500).json({ error: 'Internal server error' });
                                                                                });
                                                                        })
                                                                        .on('receipt', (transferReceipt) => {
                                                                            console.log('Transfer transaction receipt:', transferReceipt);
                                                                            //Notification
                                                                            pusher.trigger(`buy-course-channel-${toAddress}`, `buy-course-event-${toAddress}`, {
                                                                                message: 'Done!'
                                                                            })
                                                                                .then(() => {
                                                                                    console.log('Pusher event triggered successfully');
                                                                                    // res.status(200).json({ message: 'Pusher event triggered successfully' });
                                                                                })
                                                                                .catch((error) => {
                                                                                    console.log('Error');
                                                                                    // res.status(500).json({ error: 'Internal server error' });
                                                                                });

                                                                            res.status(200).json({ status: true });
                                                                        })
                                                                        .on('error', (error) => {
                                                                            console.error('Transfer transaction error:', error);
                                                                        });
                                                                })
                                                                .catch((error) => {
                                                                    console.error('Sign transfer transaction error:', error);
                                                                });
                                                            // ------------------- transfer ---------------------
                                                        })
                                                        .on('error', (error) => {
                                                            console.error('TransferFrom transaction error:', error);
                                                        });
                                                })
                                                .catch((error) => {
                                                    console.error('Sign transferFrom transaction error:', error);
                                                });
                                        })
                                        .on('error', (error) => {
                                            console.error('Approve transaction error:', error);
                                        });
                                })
                                .catch((error) => {
                                    console.error('Sign approve transaction error:', error);
                                });
                        })
                        .catch((error) => {
                            console.error('Estimate approve gas limit error:', error);
                        });
                })
                .catch((error) => {
                    console.error('Get nonce error:', error);
                });
        })
        .catch((error) => {
            console.error('Get gas price error:', error);
        });

});


app.listen(3000, () => {
    console.log('Server listening on port 3000');
});