var express = require('express');
var router 	= express.Router();

var Web3 		= require('web3');
var web3 		= new Web3();

var lightwallet 		= require('eth-lightwallet');
var txutils 			= lightwallet.txutils;
var signing 			= lightwallet.signing;
var encryption 			= lightwallet.encryption;
var HookedWeb3Provider 	= require("hooked-web3-provider");

var password 			= "!ReGa!2016";
var seed 	 			= "ReGa Risk Sharing Pet risk manager project";
var host	 			= "http://regakrlby.northeurope.cloudapp.azure.com:8545";


/* GET users listing. */
router.get('/balance', function(req, res, next) {
    lightwallet.keystore.deriveKeyFromPassword(password, function(err, pwDerivedKey) {
        
        var keystore = new lightwallet.keystore(seed, pwDerivedKey);
        
        keystore.passwordProvider = function (callback) {
    	    callback(null, password);
        };

        var web3Provider = new HookedWeb3Provider({
    	    host: host,
    	    transaction_signer: keystore
        });

        web3.setProvider(web3Provider);

        keystore.generateNewAddress(pwDerivedKey, 2);
        var addresses = keystore.getAddresses();

	    web3.eth.getBalance(addresses[0], function(err, balance) {
  		    res.status(200).json({status:"ok", address: addresses[0], balances: balance});
  	    });
    });
});

module.exports = router;
