var express = require('express');
var router 	= express.Router();

var Web3 		= require('web3');
var web3 		= new Web3();

var lightwallet 		= require('eth-lightwallet');
var txutils 			= lightwallet.txutils;
var signing 			= lightwallet.signing;
var encryption 			= lightwallet.encryption;
var keyStore            = lightwallet.keystore;
var HookedWeb3Provider 	= require("hooked-web3-provider");

var password 			= "!ReGa!2016";
var seed 	 			= "ReGa Risk Sharing Pet risk manager project";
var host	 			= "http://rega53j4n.eastus.cloudapp.azure.com:8545";


/* GET users listing. */
router.get('/balance', function(req, res, next) {
    
    console.error('api/balance called');
    
    keyStore.createVault({password: password}, function (err, ks) {

        console.error('api/balance/createVault called');
        
        ks.keyFromPassword(password, function (err, pwDerivedKey) {
            if (err) throw err;
  
            ks.generateNewAddress(pwDerivedKey, 5);
            var addr = ks.getAddresses();

            ks.passwordProvider = function (callback) {
                callback(null, password);
            };

            var web3Provider = new HookedWeb3Provider({
    	        host: host,
    	        transaction_signer: ks
            });

            web3.setProvider(web3Provider);
            
            web3.eth.getBalance(addr[0], function(err, balance) {
  		        res.status(200).json({status:"ok", address: addr[0], balances: balance, query:req.query});
  	        });
        });
    });
});

/* POST users listing. */
router.post('/contract', function(req, res, next) {
    
    console.error('api/contract called');
    
    keyStore.createVault({password: password}, function (err, ks) {

        console.error('api/contract/createVault called');
        
        ks.keyFromPassword(password, function (err, pwDerivedKey) {
            if (err) throw err;
  
            ks.generateNewAddress(pwDerivedKey, 5);
            var addr = ks.getAddresses();

            ks.passwordProvider = function (callback) {
                callback(null, password);
            };

            var web3Provider = new HookedWeb3Provider({
                host: host,
                transaction_signer: ks
            });

            web3.setProvider(web3Provider);
            
            web3.eth.getBalance(addr[0], function(err, balance) {
                res.status(200).json({status:"ok", address: addr[0], balances: balance, body:req.body});
            });
        });
    });
});

module.exports = router;
