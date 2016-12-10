var Web3 = require("web3");
var SolidityEvent = require("web3/lib/web3/event.js");

(function() {
  // Planned for future features, logging, etc.
  function Provider(provider) {
    this.provider = provider;
  }

  Provider.prototype.send = function() {
    this.provider.send.apply(this.provider, arguments);
  };

  Provider.prototype.sendAsync = function() {
    this.provider.sendAsync.apply(this.provider, arguments);
  };

  var BigNumber = (new Web3()).toBigNumber(0).constructor;

  var Utils = {
    is_object: function(val) {
      return typeof val == "object" && !Array.isArray(val);
    },
    is_big_number: function(val) {
      if (typeof val != "object") return false;

      // Instanceof won't work because we have multiple versions of Web3.
      try {
        new BigNumber(val);
        return true;
      } catch (e) {
        return false;
      }
    },
    merge: function() {
      var merged = {};
      var args = Array.prototype.slice.call(arguments);

      for (var i = 0; i < args.length; i++) {
        var object = args[i];
        var keys = Object.keys(object);
        for (var j = 0; j < keys.length; j++) {
          var key = keys[j];
          var value = object[key];
          merged[key] = value;
        }
      }

      return merged;
    },
    promisifyFunction: function(fn, C) {
      var self = this;
      return function() {
        var instance = this;

        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {
          var callback = function(error, result) {
            if (error != null) {
              reject(error);
            } else {
              accept(result);
            }
          };
          args.push(tx_params, callback);
          fn.apply(instance.contract, args);
        });
      };
    },
    synchronizeFunction: function(fn, instance, C) {
      var self = this;
      return function() {
        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {

          var decodeLogs = function(logs) {
            return logs.map(function(log) {
              var logABI = C.events[log.topics[0]];

              if (logABI == null) {
                return null;
              }

              var decoder = new SolidityEvent(null, logABI, instance.address);
              return decoder.decode(log);
            }).filter(function(log) {
              return log != null;
            });
          };

          var callback = function(error, tx) {
            if (error != null) {
              reject(error);
              return;
            }

            var timeout = C.synchronization_timeout || 240000;
            var start = new Date().getTime();

            var make_attempt = function() {
              C.web3.eth.getTransactionReceipt(tx, function(err, receipt) {
                if (err) return reject(err);

                if (receipt != null) {
                  // If they've opted into next gen, return more information.
                  if (C.next_gen == true) {
                    return accept({
                      tx: tx,
                      receipt: receipt,
                      logs: decodeLogs(receipt.logs)
                    });
                  } else {
                    return accept(tx);
                  }
                }

                if (timeout > 0 && new Date().getTime() - start > timeout) {
                  return reject(new Error("Transaction " + tx + " wasn't processed in " + (timeout / 1000) + " seconds!"));
                }

                setTimeout(make_attempt, 1000);
              });
            };

            make_attempt();
          };

          args.push(tx_params, callback);
          fn.apply(self, args);
        });
      };
    }
  };

  function instantiate(instance, contract) {
    instance.contract = contract;
    var constructor = instance.constructor;

    // Provision our functions.
    for (var i = 0; i < instance.abi.length; i++) {
      var item = instance.abi[i];
      if (item.type == "function") {
        if (item.constant == true) {
          instance[item.name] = Utils.promisifyFunction(contract[item.name], constructor);
        } else {
          instance[item.name] = Utils.synchronizeFunction(contract[item.name], instance, constructor);
        }

        instance[item.name].call = Utils.promisifyFunction(contract[item.name].call, constructor);
        instance[item.name].sendTransaction = Utils.promisifyFunction(contract[item.name].sendTransaction, constructor);
        instance[item.name].request = contract[item.name].request;
        instance[item.name].estimateGas = Utils.promisifyFunction(contract[item.name].estimateGas, constructor);
      }

      if (item.type == "event") {
        instance[item.name] = contract[item.name];
      }
    }

    instance.allEvents = contract.allEvents;
    instance.address = contract.address;
    instance.transactionHash = contract.transactionHash;
  };

  // Use inheritance to create a clone of this contract,
  // and copy over contract's static functions.
  function mutate(fn) {
    var temp = function Clone() { return fn.apply(this, arguments); };

    Object.keys(fn).forEach(function(key) {
      temp[key] = fn[key];
    });

    temp.prototype = Object.create(fn.prototype);
    bootstrap(temp);
    return temp;
  };

  function bootstrap(fn) {
    fn.web3 = new Web3();
    fn.class_defaults  = fn.prototype.defaults || {};

    // Set the network iniitally to make default data available and re-use code.
    // Then remove the saved network id so the network will be auto-detected on first use.
    fn.setNetwork("default");
    fn.network_id = null;
    return fn;
  };

  // Accepts a contract object created with web3.eth.contract.
  // Optionally, if called without `new`, accepts a network_id and will
  // create a new version of the contract abstraction with that network_id set.
  function Contract() {
    if (this instanceof Contract) {
      instantiate(this, arguments[0]);
    } else {
      var C = mutate(Contract);
      var network_id = arguments.length > 0 ? arguments[0] : "default";
      C.setNetwork(network_id);
      return C;
    }
  };

  Contract.currentProvider = null;

  Contract.setProvider = function(provider) {
    var wrapped = new Provider(provider);
    this.web3.setProvider(wrapped);
    this.currentProvider = provider;
  };

  Contract.new = function() {
    if (this.currentProvider == null) {
      throw new Error("regaPool error: Please call setProvider() first before calling new().");
    }

    var args = Array.prototype.slice.call(arguments);

    if (!this.unlinked_binary) {
      throw new Error("regaPool error: contract binary not set. Can't deploy new instance.");
    }

    var regex = /__[^_]+_+/g;
    var unlinked_libraries = this.binary.match(regex);

    if (unlinked_libraries != null) {
      unlinked_libraries = unlinked_libraries.map(function(name) {
        // Remove underscores
        return name.replace(/_/g, "");
      }).sort().filter(function(name, index, arr) {
        // Remove duplicates
        if (index + 1 >= arr.length) {
          return true;
        }

        return name != arr[index + 1];
      }).join(", ");

      throw new Error("regaPool contains unresolved libraries. You must deploy and link the following libraries before you can deploy a new version of regaPool: " + unlinked_libraries);
    }

    var self = this;

    return new Promise(function(accept, reject) {
      var contract_class = self.web3.eth.contract(self.abi);
      var tx_params = {};
      var last_arg = args[args.length - 1];

      // It's only tx_params if it's an object and not a BigNumber.
      if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
        tx_params = args.pop();
      }

      tx_params = Utils.merge(self.class_defaults, tx_params);

      if (tx_params.data == null) {
        tx_params.data = self.binary;
      }

      // web3 0.9.0 and above calls new twice this callback twice.
      // Why, I have no idea...
      var intermediary = function(err, web3_instance) {
        if (err != null) {
          reject(err);
          return;
        }

        if (err == null && web3_instance != null && web3_instance.address != null) {
          accept(new self(web3_instance));
        }
      };

      args.push(tx_params, intermediary);
      contract_class.new.apply(contract_class, args);
    });
  };

  Contract.at = function(address) {
    if (address == null || typeof address != "string" || address.length != 42) {
      throw new Error("Invalid address passed to regaPool.at(): " + address);
    }

    var contract_class = this.web3.eth.contract(this.abi);
    var contract = contract_class.at(address);

    return new this(contract);
  };

  Contract.deployed = function() {
    if (!this.address) {
      throw new Error("Cannot find deployed address: regaPool not deployed or address not set.");
    }

    return this.at(this.address);
  };

  Contract.defaults = function(class_defaults) {
    if (this.class_defaults == null) {
      this.class_defaults = {};
    }

    if (class_defaults == null) {
      class_defaults = {};
    }

    var self = this;
    Object.keys(class_defaults).forEach(function(key) {
      var value = class_defaults[key];
      self.class_defaults[key] = value;
    });

    return this.class_defaults;
  };

  Contract.extend = function() {
    var args = Array.prototype.slice.call(arguments);

    for (var i = 0; i < arguments.length; i++) {
      var object = arguments[i];
      var keys = Object.keys(object);
      for (var j = 0; j < keys.length; j++) {
        var key = keys[j];
        var value = object[key];
        this.prototype[key] = value;
      }
    }
  };

  Contract.all_networks = {
  "default": {
    "abi": [
      {
        "constant": true,
        "inputs": [
          {
            "name": "_level",
            "type": "uint256"
          }
        ],
        "name": "getPool",
        "outputs": [
          {
            "name": "_pool",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "name",
        "outputs": [
          {
            "name": "",
            "type": "bytes32"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "_loan",
            "type": "int256"
          }
        ],
        "name": "checkLimit",
        "outputs": [
          {
            "name": "",
            "type": "bool"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "minScore",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_parent",
            "type": "address"
          }
        ],
        "name": "setParent",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_dr",
            "type": "uint8"
          },
          {
            "name": "_cr",
            "type": "uint8"
          },
          {
            "name": "_amount",
            "type": "int256"
          }
        ],
        "name": "posting",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_number",
            "type": "int256"
          },
          {
            "name": "_case",
            "type": "int256"
          }
        ],
        "name": "update",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "risk",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "name": "members",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "_loan",
            "type": "int256"
          },
          {
            "name": "_member",
            "type": "address"
          }
        ],
        "name": "lendingCheck",
        "outputs": [
          {
            "name": "",
            "type": "bool"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "parent",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "level",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_pool",
            "type": "address"
          }
        ],
        "name": "push",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "owner",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_amount",
            "type": "int256"
          }
        ],
        "name": "loan",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "_member",
            "type": "address"
          }
        ],
        "name": "accept",
        "outputs": [
          {
            "name": "_accept",
            "type": "bool"
          },
          {
            "name": "_pool",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "_member",
            "type": "address"
          }
        ],
        "name": "isMember",
        "outputs": [
          {
            "name": "",
            "type": "bool"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "limit",
        "outputs": [
          {
            "name": "",
            "type": "int256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_amount",
            "type": "int256"
          },
          {
            "name": "_level",
            "type": "uint256"
          }
        ],
        "name": "loan",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "cases",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "isValid",
        "outputs": [
          {
            "name": "_valid",
            "type": "bool"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_member",
            "type": "address"
          }
        ],
        "name": "insert",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_loan",
            "type": "int256"
          },
          {
            "name": "_member",
            "type": "address"
          }
        ],
        "name": "lend",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "name": "accounts",
        "outputs": [
          {
            "name": "",
            "type": "int256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "inputs": [
          {
            "name": "_minScore",
            "type": "uint256"
          },
          {
            "name": "_owner",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "constructor"
      }
    ],
    "unlinked_binary": "0x606060405234610000576040516040806110c18339810160405280516020909101515b60008055600160028190558290557f506f6f6c0000000000000000000000000000000000000000000000000000000060105560048054600160a060020a0319166c01000000000000000000000000838102041790555b50505b611038806100896000396000f36060604052361561011c5760e060020a6000350463068bcd8d811461012157806306fdde031461014d5780630ff04c9a1461016c57806313c2bedc146101905780631499c592146101af578063172f278d146101c15780631a3f98b1146101d9578063426a0c88146101ee5780635daf08ca1461020d578063607474cf1461023957806360f96a8f146102605780636fd5ae151461028957806389b09de7146102a85780638da5cb5b146102ba5780639283d8c2146102e35780639f005920146102f5578063a230c52414610328578063a4d66daf1461034c578063ac68ca471461036b578063b5cbc49b14610380578063bb5d40eb1461039f578063bc902ad2146103c0578063f10d4791146103d2578063f2a40db8146103e7575b610000565b3461000057610131600435610409565b60408051600160a060020a039092168252519081900360200190f35b346100005761015a61048f565b60408051918252519081900360200190f35b346100005761017c600435610495565b604080519115158252519081900360200190f35b346100005761015a6104bf565b60408051918252519081900360200190f35b34610000576101bf6004356104c5565b005b34610000576101bf6004356024356044356104f9565b005b34610000576101bf600435602435610596565b005b346100005761015a610618565b60408051918252519081900360200190f35b346100005761013160043561061e565b60408051600160a060020a039092168252519081900360200190f35b346100005761017c60043560243561064e565b604080519115158252519081900360200190f35b3461000057610131610765565b60408051600160a060020a039092168252519081900360200190f35b346100005761015a610774565b60408051918252519081900360200190f35b34610000576101bf60043561077a565b005b3461000057610131610855565b60408051600160a060020a039092168252519081900360200190f35b34610000576101bf600435610864565b005b34610000576103056004356109a4565b604080519215158352600160a060020a0390911660208301528051918290030190f35b346100005761017c600435610a93565b604080519115158252519081900360200190f35b346100005761015a610b4e565b60408051918252519081900360200190f35b34610000576101bf600435602435610b54565b005b346100005761015a610bce565b60408051918252519081900360200190f35b346100005761017c610bd4565b604080519115158252519081900360200190f35b34610000576101bf6004356104f6565b005b34610000576101bf600435602435610c1d565b005b346100005761015a600435610c80565b60408051918252519081900360200190f35b600060025482141561041c57503061048a565b601260009054906101000a9004600160a060020a0316600160a060020a031663068bcd8d836000604051602001526040518260e060020a02815260040180828152602001915050602060405180830381600087803b156100005760325a03f115610000575050604051519150505b919050565b60105481565b60006000826104a46008610c97565b6013540103126104b65750600161048a565b5060005b919050565b60015481565b6012805473ffffffffffffffffffffffffffffffffffffffff19166c01000000000000000000000000838102041790555b50565b610504838383610df3565b6012546040517f172f278d000000000000000000000000000000000000000000000000000000008152600160a060020a039091169063172f278d908590859085906004018084600a811161000057815260200183600a81116100005781526020018281526020019350505050600060405180830381600087803b156100005760325a03f115610000575050505b505050565b6105a08282610e10565b601254604080517f1a3f98b100000000000000000000000000000000000000000000000000000000815260048101859052602481018490529051600160a060020a0390921691631a3f98b19160448082019260009290919082900301818387803b156100005760325a03f115610000575050505b5050565b60005481565b601181815481101561000057906000526020600020900160005b915054906101000a9004600160a060020a031681565b60008230600160a060020a0316311080610677575060045433600160a060020a03908116911614155b806106d6575081600160a060020a0316630ff04c9a846000604051602001526040518260e060020a02815260040180828152602001915050602060405180830381600087803b156100005760325a03f115610000575050604051511590505b8061074e575030600160a060020a031682600160a060020a031663068bcd8d6002546000604051602001526040518260e060020a02815260040180828152602001915050602060405180830381600087803b156100005760325a03f11561000057505060405151600160a060020a0316919091141590505b1561075b5750600061075f565b5060015b92915050565b601254600160a060020a031681565b60025481565b601180548060010182818154818355818115116107bc576000838152602090206107bc9181019083015b808211156107b857600081556001016107a4565b5090565b5b505050916000526020600020900160005b83909190916101000a815481600160a060020a0302191690836c010000000000000000000000009081020402179055505080600160a060020a0316631499c592306040518260e060020a0281526004018082600160a060020a03168152602001915050600060405180830381600087803b156100005760325a03f115610000575050505b50565b600454600160a060020a031681565b6000600033600160a060020a0316636fd5ae156000604051602001526040518160e060020a028152600401809050602060405180830381600087803b156100005760325a03f1156100005750506040515192506108c2905083610495565b15806108d757508230600160a060020a031631105b806108eb5750601254600160a060020a0316155b80610910575033600160a060020a031661090483610409565b600160a060020a031614155b1561091a57610000565b6109246002610c97565b8303905060008113610934575060005b6109416008600283610df3565b6012546040805160e060020a63ac68ca4702815260048101849052602481018590529051600160a060020a039092169163ac68ca479160448082019260009290919082900301818387803b156100005760325a03f115610000575050505b505050565b6000600060006109b384610e32565b90935091508215156109cc576000600092509250610a8d565b5060005b601154811015610a8457601181815481101561000057906000526020600020900160005b9054906101000a9004600160a060020a0316600160a060020a0316639f005920856000604051604001526040518260e060020a0281526004018082600160a060020a03168152602001915050604060405180830381600087803b156100005760325a03f11561000057505060405180516020909101519094509250508215610a7b57610a8d565b5b6001016109d0565b60006000925092505b50915091565b6000805b601154811015610b4357601181815481101561000057906000526020600020900160005b9054906101000a9004600160a060020a0316600160a060020a031663a230c524846000604051602001526040518260e060020a0281526004018082600160a060020a03168152602001915050602060405180830381600087803b156100005760325a03f11561000057505060405151159050610b3a5760019150610b48565b5b600101610a97565b600091505b50919050565b60135481565b610b616008600284610df3565b600254811015610614576012546040805160e060020a63ac68ca4702815260048101859052602481018490529051600160a060020a039092169163ac68ca479160448082019260009290919082900301818387803b156100005760325a03f115610000575050505b5b5050565b60035481565b600060018160025b600b811015610c0457600581600b811015610000570160005b5054820191505b600101610bdc565b8115610c0f57600092505b8293505b50505090565b5b50565b610c27828261064e565b1515610c3257610000565b80600160a060020a0316639283d8c2836040518260e060020a02815260040180828152602001915050600060405180830381600087803b156100005760325a03f115610000575050505b5050565b600581600b811015610000570160005b5054905081565b60008082600a8111610000571415610cb757600560005b5054905061048a565b600182600a8111610000571415610cd657600660005b5054905061048a565b600282600a8111610000571415610cf557600760005b5054905061048a565b600382600a8111610000571415610d1457600860005b5054905061048a565b600482600a8111610000571415610d3357600960005b5054905061048a565b600582600a8111610000571415610d5257600a60005b5054905061048a565b600682600a8111610000571415610d7157600b60005b5054905061048a565b600782600a8111610000571415610d9057600c60005b5054905061048a565b600882600a8111610000571415610daf57600d60005b5054905061048a565b600982600a8111610000571415610dce57600e60005b5054905061048a565b600a82600a811161000057141561048a57600f60005b5054905061048a565b5b919050565b610e008160000384610ea7565b6105918183610ea7565b5b505050565b81600560005b50805491909101905580600660005b50805490910190555b5050565b6000600060015483600160a060020a031663efedc6696000604051602001526040518160e060020a028152600401809050602060405180830381600087803b156100005760325a03f11561000057505060405151919091109050610e9b57506001905030610ea2565b5060009050805b915091565b600081600a8111610000571415610ecb5781600560005b5080549091019055610614565b600181600a8111610000571415610eef5781600660005b5080549091019055610614565b600281600a8111610000571415610f135781600760005b5080549091019055610614565b600381600a8111610000571415610f375781600860005b5080549091019055610614565b600481600a8111610000571415610f5b5781600960005b5080549091019055610614565b600581600a8111610000571415610f7f5781600a60005b5080549091019055610614565b600681600a8111610000571415610fa35781600b60005b5080549091019055610614565b600781600a8111610000571415610fc75781600c60005b5080549091019055610614565b600881600a8111610000571415610feb5781600d60005b5080549091019055610614565b600981600a811161000057141561100f5781600e60005b5080549091019055610614565b600a81600a81116100005714156106145781600f60005b5080549091019055610614565b5b505056",
    "events": {},
    "updated_at": 1481357558647
  }
};

  Contract.checkNetwork = function(callback) {
    var self = this;

    if (this.network_id != null) {
      return callback();
    }

    this.web3.version.network(function(err, result) {
      if (err) return callback(err);

      var network_id = result.toString();

      // If we have the main network,
      if (network_id == "1") {
        var possible_ids = ["1", "live", "default"];

        for (var i = 0; i < possible_ids.length; i++) {
          var id = possible_ids[i];
          if (Contract.all_networks[id] != null) {
            network_id = id;
            break;
          }
        }
      }

      if (self.all_networks[network_id] == null) {
        return callback(new Error(self.name + " error: Can't find artifacts for network id '" + network_id + "'"));
      }

      self.setNetwork(network_id);
      callback();
    })
  };

  Contract.setNetwork = function(network_id) {
    var network = this.all_networks[network_id] || {};

    this.abi             = this.prototype.abi             = network.abi;
    this.unlinked_binary = this.prototype.unlinked_binary = network.unlinked_binary;
    this.address         = this.prototype.address         = network.address;
    this.updated_at      = this.prototype.updated_at      = network.updated_at;
    this.links           = this.prototype.links           = network.links || {};
    this.events          = this.prototype.events          = network.events || {};

    this.network_id = network_id;
  };

  Contract.networks = function() {
    return Object.keys(this.all_networks);
  };

  Contract.link = function(name, address) {
    if (typeof name == "function") {
      var contract = name;

      if (contract.address == null) {
        throw new Error("Cannot link contract without an address.");
      }

      Contract.link(contract.contract_name, contract.address);

      // Merge events so this contract knows about library's events
      Object.keys(contract.events).forEach(function(topic) {
        Contract.events[topic] = contract.events[topic];
      });

      return;
    }

    if (typeof name == "object") {
      var obj = name;
      Object.keys(obj).forEach(function(name) {
        var a = obj[name];
        Contract.link(name, a);
      });
      return;
    }

    Contract.links[name] = address;
  };

  Contract.contract_name   = Contract.prototype.contract_name   = "regaPool";
  Contract.generated_with  = Contract.prototype.generated_with  = "3.2.0";

  // Allow people to opt-in to breaking changes now.
  Contract.next_gen = false;

  var properties = {
    binary: function() {
      var binary = Contract.unlinked_binary;

      Object.keys(Contract.links).forEach(function(library_name) {
        var library_address = Contract.links[library_name];
        var regex = new RegExp("__" + library_name + "_*", "g");

        binary = binary.replace(regex, library_address.replace("0x", ""));
      });

      return binary;
    }
  };

  Object.keys(properties).forEach(function(key) {
    var getter = properties[key];

    var definition = {};
    definition.enumerable = true;
    definition.configurable = false;
    definition.get = getter;

    Object.defineProperty(Contract, key, definition);
    Object.defineProperty(Contract.prototype, key, definition);
  });

  bootstrap(Contract);

  if (typeof module != "undefined" && typeof module.exports != "undefined") {
    module.exports = Contract;
  } else {
    // There will only be one version of this contract in the browser,
    // and we can use that.
    window.regaPool = Contract;
  }
})();
