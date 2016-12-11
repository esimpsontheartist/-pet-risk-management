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
var abi                 = [{"constant":true,"inputs":[{"name":"_level","type":"uint256"}],"name":"getPool","outputs":[{"name":"_pool","type":"address"}],"type":"function"},{"constant":false,"inputs":[{"name":"_parent","type":"address"}],"name":"setParent","outputs":[],"type":"function"},{"constant":false,"inputs":[{"name":"_dr","type":"uint8"},{"name":"_cr","type":"uint8"},{"name":"_amount","type":"int256"}],"name":"posting","outputs":[],"type":"function"},{"constant":false,"inputs":[{"name":"_number","type":"int256"},{"name":"_case","type":"int256"}],"name":"update","outputs":[],"type":"function"},{"constant":false,"inputs":[{"name":"_amount","type":"int256"}],"name":"invest","outputs":[],"type":"function"},{"constant":true,"inputs":[],"name":"parent","outputs":[{"name":"","type":"address"}],"type":"function"},{"constant":true,"inputs":[],"name":"owner","outputs":[{"name":"","type":"address"}],"type":"function"},{"constant":true,"inputs":[],"name":"isValid","outputs":[{"name":"_valid","type":"bool"}],"type":"function"},{"constant":true,"inputs":[],"name":"score","outputs":[{"name":"","type":"uint256"}],"type":"function"},{"constant":true,"inputs":[{"name":"","type":"uint256"}],"name":"accounts","outputs":[{"name":"","type":"int256"}],"type":"function"},{"inputs":[{"name":"_score","type":"uint256"},{"name":"_owner","type":"address"}],"type":"constructor"}];
var contractAddr        = "0x6cd0f3b9e9e3191dfef4c5f1572e4ca0cbfb4f3c";

/* GET users listing. */
router.get('/contract', function(req, res, next) {
    
    console.error('api/contract called');
    
    keyStore.createVault({password: password}, function (err, ks) {

        console.error('api/contract/createVault called');
        
        ks.keyFromPassword(password, function (err, pwDerivedKey) {
            if (err) throw err;
  
            ks.generateNewAddress(pwDerivedKey, 1);
            var addr = ks.getAddresses();

            ks.passwordProvider = function (callback) {
                callback(null, password);
            };

            var web3Provider = new HookedWeb3Provider({
    	        host: host,
    	        transaction_signer: ks
            });

            web3.setProvider(web3Provider);

            var contract = web3.eth.contract(abi);
            var instance = contract.at(contractAddr);

            var gas         = 5000000;
            var gasPrice    = web3.toWei(20, "gwei");
            var address     = addr[0];
            var value       = web3.toWei(1, "ether");
            
            instance.invest.sendTransaction(value, {gas: gas, gasPrice: gasPrice, value: value, from: address}, function(err, balance) {
            // web3.eth.getBalance(addr[0], function(err, balance) {
  		        res.status(200).json({status:"ok", address: addr[0], balances: balance, query:req.query});
  	        });
        });
    });
});

/* GET users listing. */
router.get('/balance', function(req, res, next) {
    
    console.error('api/balance called');
    
    keyStore.createVault({password: password}, function (err, ks) {

        console.error('api/balance/createVault called');
        
        ks.keyFromPassword(password, function (err, pwDerivedKey) {
            if (err) throw err;
  
            ks.generateNewAddress(pwDerivedKey, 1);
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

module.exports = router;
