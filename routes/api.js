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

var global_keystore;
var web3Provider;

lightwallet.keystore.deriveKeyFromPassword(password, function(err, pwDerivedKey) {

	global_keystore = new lightwallet.keystore(seed, pwDerivedKey);
    
    global_keystore.passwordProvider = function (callback) {
    	callback(null, password);
    };

    web3Provider = new HookedWeb3Provider({
    	host: host,
    	transaction_signer: global_keystore
    });

    web3.setProvider(web3Provider);
});

/* GET users listing. */
router.get('/', function(req, res, next) {
  res.status(200).json({status:"ok", token:'auth.oauth2.1234567890'});
});

module.exports = router;
