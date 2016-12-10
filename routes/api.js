var express = require('express');
var router 	= express.Router();

var Web3 		= require('web3');
var web3 		= new Web3();

var lightwallet 		= require('eth-lightwallet')
var txutils 			= lightwallet.txutils
var signing 			= lightwallet.signing
var encryption 			= lightwallet.encryption
var HookedWeb3Provider 	= require("hooked-web3-provider")

/* GET users listing. */
router.get('/', function(req, res, next) {
  res.status(200).json({status:"ok", token:'auth.oauth2.1234567890'});
});

module.exports = router;
