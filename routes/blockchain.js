var Web3                = require('web3');
var web3                = new Web3();

var lightwallet         = require('eth-lightwallet');
var HookedWeb3Provider  = require("hooked-web3-provider");

var keyStore            = lightwallet.keystore;
var seed                = keyStore.generateRandomSeed();
var host                = "http://rega53j4n.eastus.cloudapp.azure.com:8545";
var pswd                = "!ReGa!2016";
var contractAddr        = "0x6cd0f3b9e9e3191dfef4c5f1572e4ca0cbfb4f3c";

var abi                 = [{"constant":true,"inputs":[{"name":"_level","type":"uint256"}],"name":"getPool","outputs":[{"name":"_pool","type":"address"}],"type":"function"},{"constant":false,"inputs":[{"name":"_parent","type":"address"}],"name":"setParent","outputs":[],"type":"function"},{"constant":false,"inputs":[{"name":"_dr","type":"uint8"},{"name":"_cr","type":"uint8"},{"name":"_amount","type":"int256"}],"name":"posting","outputs":[],"type":"function"},{"constant":false,"inputs":[{"name":"_number","type":"int256"},{"name":"_case","type":"int256"}],"name":"update","outputs":[],"type":"function"},{"constant":false,"inputs":[{"name":"_amount","type":"int256"}],"name":"invest","outputs":[],"type":"function"},{"constant":true,"inputs":[],"name":"parent","outputs":[{"name":"","type":"address"}],"type":"function"},{"constant":true,"inputs":[],"name":"owner","outputs":[{"name":"","type":"address"}],"type":"function"},{"constant":true,"inputs":[],"name":"isValid","outputs":[{"name":"_valid","type":"bool"}],"type":"function"},{"constant":true,"inputs":[],"name":"score","outputs":[{"name":"","type":"uint256"}],"type":"function"},{"constant":true,"inputs":[{"name":"","type":"uint256"}],"name":"accounts","outputs":[{"name":"","type":"int256"}],"type":"function"},{"inputs":[{"name":"_score","type":"uint256"},{"name":"_owner","type":"address"}],"type":"constructor"}];

var blockchain = function() {};
    
    blockchain.addr     = [];
    blockchain.kstore   = null;
    blockchain.provider = null;
    
    blockchain.prototype.createAccounts = function(success) {
       
        keyStore.createVault({password: pswd, seedPhrase: seed}, function (err, ks) {
            if (err) throw err;
            
            this.kstore = ks;

            console.info("blockchain.createAccounts.createVault seed [" + seed + "]");

            this.kstore.keyFromPassword(pswd, function (err, pwDerivedKey) {
                if (err) throw err;

                this.kstore.generateNewAddress(pwDerivedKey, 2);
                this.addr = this.kstore.getAddresses();

                this.kstore.passwordProvider = function (callback) {
                    callback(null, pswd);
                };

                this.provider = new HookedWeb3Provider({
    	            host: host,
    	            transaction_signer: this.kstore
                });

                web3.setProvider(this.provider);

                success(this.addr);
            });
        });
    };

    blockchain.prototype.getBalance = function(acc, success) {

        if(web3 == null)
            throw new Error('getBalance: Web3 provider is null');

        web3.eth.getBalance(acc, function(err, balance) {
             if (err) 
                throw err;
             else
                success(balance);
        });
    };

    blockchain.prototype.getAccount = function(accId) {
        
        if(this.addr == null)
            throw new Error('getAccount: accounts is null');
        if(this.addr.length == 0)
            throw new Error('getAccount: accounts is empty');

        if(accId < 0 || accId >= this.addr.length) {
            throw new Error('getAccount: Invalid account ID - out of range');
        }
        return this.addr[accId];
    };

    blockchain.prototype.invest = function(amount, success) {
        
        if(web3 == null)
            throw new Error('invest: Web3 provider is null');
        if(this.addr == null)
            throw new Error('invest: accounts is null');
        if(this.addr.length == 0)
            throw new Error('invest: accounts is empty');

        var contract    = web3.eth.contract(abi);
        var instance    = contract.at(contractAddr);

        var gas         = 5000000;
        var gasPrice    = web3.toWei(20, "gwei");
        var address     = this.addr[0];
        var value       = web3.toWei(parseInt(amount), "ether");

         instance.invest.sendTransaction(value, {gas: gas, gasPrice: gasPrice, value: value, from: address}, function(err, balance) {
             if (err) 
                throw err;
             else
                success(balance);
         });
    };

module.exports = new blockchain();