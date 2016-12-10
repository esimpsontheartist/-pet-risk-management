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
      throw new Error("regaMember error: Please call setProvider() first before calling new().");
    }

    var args = Array.prototype.slice.call(arguments);

    if (!this.unlinked_binary) {
      throw new Error("regaMember error: contract binary not set. Can't deploy new instance.");
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

      throw new Error("regaMember contains unresolved libraries. You must deploy and link the following libraries before you can deploy a new version of regaMember: " + unlinked_libraries);
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
      throw new Error("Invalid address passed to regaMember.at(): " + address);
    }

    var contract_class = this.web3.eth.contract(this.abi);
    var contract = contract_class.at(address);

    return new this(contract);
  };

  Contract.deployed = function() {
    if (!this.address) {
      throw new Error("Cannot find deployed address: regaMember not deployed or address not set.");
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
        "name": "provider",
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
        "constant": true,
        "inputs": [],
        "name": "approved",
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
        "inputs": [
          {
            "name": "_cost",
            "type": "int256"
          }
        ],
        "name": "acceptCase",
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
        "constant": false,
        "inputs": [
          {
            "name": "_cost",
            "type": "int256"
          }
        ],
        "name": "submitCase",
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
        "constant": false,
        "inputs": [
          {
            "name": "_amount",
            "type": "int256"
          }
        ],
        "name": "invest",
        "outputs": [],
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
        "inputs": [
          {
            "name": "_loan",
            "type": "int256"
          }
        ],
        "name": "ask4Loan",
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
        "inputs": [],
        "name": "pay2Provider",
        "outputs": [],
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
            "name": "_provider",
            "type": "address"
          }
        ],
        "name": "setProvider",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "score",
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
        "constant": false,
        "inputs": [],
        "name": "approveProvider",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "inputs": [
          {
            "name": "_score",
            "type": "uint256"
          },
          {
            "name": "_limit",
            "type": "int256"
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
    "unlinked_binary": "0x606060405234610000576040516060806112498339810160409081528151602083015191909201515b600e83905560008054600160a060020a0319166c0100000000000000000000000083810204179055600d8290555b5050505b6111e1806100686000396000f3606060405236156100fb5760e060020a6000350463068bcd8d8114610100578063085d48831461012c5780630ff04c9a146101555780631499c59214610179578063172f278d1461018b57806319d40b08146101a35780631a3f98b1146101c45780631f13c320146101d95780633cc561131461020c5780634324100d1461023f57806360f96a8f1461025157806365acbb841461027a5780638da5cb5b146102ad5780639283d8c2146102d6578063a4d66daf146102e8578063b00cfae814610307578063bb5d40eb14610316578063cfd8d6c014610337578063efedc66914610349578063f2a40db814610368578063fcc8cd1a1461038a575b610000565b3461000057610110600435610399565b60408051600160a060020a039092168252519081900360200190f35b3461000057610110610419565b60408051600160a060020a039092168252519081900360200190f35b3461000057610165600435610428565b604080519115158252519081900360200190f35b3461000057610189600435610452565b005b3461000057610189600435602435604435610486565b005b3461000057610165610523565b604080519115158252519081900360200190f35b3461000057610189600435602435610533565b005b34610000576101e96004356105b5565b604080519215158352600160a060020a0390911660208301528051918290030190f35b34610000576101e960043561064a565b604080519215158352600160a060020a0390911660208301528051918290030190f35b34610000576101896004356107be565b005b34610000576101106109d9565b60408051600160a060020a039092168252519081900360200190f35b34610000576101e96004356109e8565b604080519215158352600160a060020a0390911660208301528051918290030190f35b3461000057610110610aa7565b60408051600160a060020a039092168252519081900360200190f35b3461000057610189600435610ab6565b005b34610000576102f5610c0c565b60408051918252519081900360200190f35b3461000057610189610c12565b005b3461000057610165610cf5565b604080519115158252519081900360200190f35b3461000057610189600435610d3a565b005b34610000576102f5610de4565b60408051918252519081900360200190f35b34610000576102f5600435610dea565b60408051918252519081900360200190f35b3461000057610189610e01565b005b600c54604080516000602091820181905282517f068bcd8d0000000000000000000000000000000000000000000000000000000081526004810186905292519093600160a060020a03169263068bcd8d92602480830193919282900301818787803b156100005760325a03f115610000575050604051519150505b919050565b600f54600160a060020a031681565b60006000826104376008610eb5565b600d5401031261044957506001610414565b5060005b919050565b600c805473ffffffffffffffffffffffffffffffffffffffff19166c01000000000000000000000000838102041790555b50565b610491838383611011565b600c546040517f172f278d000000000000000000000000000000000000000000000000000000008152600160a060020a039091169063172f278d908590859085906004018084600a811161000057815260200183600a81116100005781526020018281526020019350505050600060405180830381600087803b156100005760325a03f115610000575050505b505050565b600f5460a060020a900460ff1681565b61053d828261102e565b600c54604080517f1a3f98b100000000000000000000000000000000000000000000000000000000815260048101859052602481018490529051600160a060020a0390921691631a3f98b19160448082019260009290919082900301818387803b156100005760325a03f115610000575050505b5050565b60006000600c60009054906101000a9004600160a060020a0316600160a060020a031663b5cbc49b6000604051602001526040518160e060020a028152600401809050602060405180830381600087803b156100005760325a03f1156100005750506040515190506106276001610eb5565b1061063757506000905080610645565b610640836109e8565b915091505b915091565b60008054819081908190819033600160a060020a039081169116146106765760006000945094506107b6565b61067f866105b5565b90955093508415156106985760006000945094506107b6565b6106a26000610399565b92506106ae6001610399565b91506106ba6002610399565b905082600160a060020a0316631a3f98b1600060016040518360e060020a0281526004018083815260200182815260200192505050600060405180830381600087803b156100005760325a03f1156100005750505081600160a060020a0316631a3f98b1600060016040518360e060020a0281526004018083815260200182815260200192505050600060405180830381600087803b156100005760325a03f1156100005750505080600160a060020a0316631a3f98b1600060016040518360e060020a0281526004018083815260200182815260200192505050600060405180830381600087803b156100005760325a03f115610000575050505b505050915091565b60006000600060006000600060008730600160a060020a03163110806107f3575060005433600160a060020a03908116911614155b156107fd57610000565b6064603d89020596506064600989020595506064600f89020594506108256009600289610486565b6108326009600388610486565b61083f6009600487610486565b61084c6009600587610486565b6108566000610399565b93506108626001610399565b925061086e6002610399565b915083600160a060020a0316638da5cb5b6000604051602001526040518160e060020a028152600401809050602060405180830381600087803b156100005760325a03f11561000057505060405151915050600160a060020a038416158015906108e05750600160a060020a03831615155b80156108f45750600160a060020a03821615155b80156109085750600160a060020a03811615155b156109cd57604051600160a060020a0382169086156108fc029087906000818181858888f19350505050151561093d57610000565b604051600160a060020a0385169086156108fc029087906000818181858888f19350505050151561096d57610000565b604051600160a060020a0384169087156108fc029088906000818181858888f19350505050151561099d57610000565b604051600160a060020a0383169088156108fc029089906000818181858888f1935050505015156109cd57610000565b5b5b5050505050505050565b600c54600160a060020a031681565b600060006000600060006109fb86610428565b1515610a0e5760006000945094506107b6565b610a186000610399565b9250610a246001610399565b9150610a306002610399565b9050600160a060020a03811631869010610a5457600181945094506107b656610a94565b600160a060020a03821631869010610a7657600182945094506107b656610a94565b600160a060020a03831631869010610a9457600183945094506107b6565b5b5b60006000945094505b505050915091565b600054600160a060020a031681565b6000600033600160a060020a0316636fd5ae156000604051602001526040518160e060020a028152600401809050602060405180830381600087803b156100005760325a03f115610000575050604051519250610b14905083610428565b1580610b2957508230600160a060020a031631105b80610b3d5750600c54600160a060020a0316155b80610b62575033600160a060020a0316610b5683610399565b600160a060020a031614155b15610b6c57610000565b610b766002610eb5565b8303905060008113610b86575060005b610b936008600283611011565b600c54604080517fac68ca4700000000000000000000000000000000000000000000000000000000815260048101849052602481018590529051600160a060020a039092169163ac68ca479160448082019260009290919082900301818387803b156100005760325a03f115610000575050505b505050565b600d5481565b600160a060020a033016316000610c296002610eb5565b600f54909150600160a060020a03161580610c4e5750600f5460a060020a900460ff16155b80610c68575060005433600160a060020a03908116911614155b80610c71575081155b80610c7b57508181105b80610c87575081600d54105b15610c9157610000565b610c9e6002600784610486565b600f54604051600160a060020a039091169083156108fc029084906000818181858888f193505050501515610cd257610000565b600f805474ffffffffffffffffffffffffffffffffffffffffff191690555b5050565b600060018160025b600b811015610d2557600181600b811015610000570160005b5054820191505b600101610cfd565b8115610d3057600092505b8293505b50505090565b6000610d466000610399565b905080600160a060020a0316638da5cb5b6000604051602001526040518160e060020a028152600401809050602060405180830381600087803b156100005760325a03f1156100005750506040515133600160a060020a039081169116149050610daf57610000565b600f805473ffffffffffffffffffffffffffffffffffffffff19166c01000000000000000000000000848102041790555b5050565b600e5481565b600181600b811015610000570160005b5054905081565b6000610e0d6001610399565b600f54909150600160a060020a03161580610e83575080600160a060020a0316638da5cb5b6000604051602001526040518160e060020a028152600401809050602060405180830381600087803b156100005760325a03f1156100005750506040515133600160a060020a039081169116141590505b15610e8d57610000565b600f805474ff0000000000000000000000000000000000000000191660a060020a1790555b50565b60008082600a8111610000571415610ed557600160005b50549050610414565b600182600a8111610000571415610ef457600260005b50549050610414565b600282600a8111610000571415610f1357600360005b50549050610414565b600382600a8111610000571415610f3257600460005b50549050610414565b600482600a8111610000571415610f5157600560005b50549050610414565b600582600a8111610000571415610f7057600660005b50549050610414565b600682600a8111610000571415610f8f57600760005b50549050610414565b600782600a8111610000571415610fae57600860005b50549050610414565b600882600a8111610000571415610fcd57600960005b50549050610414565b600982600a8111610000571415610fec57600a60005b50549050610414565b600a82600a811161000057141561041457600b60005b50549050610414565b5b919050565b61101e8160000384611050565b61051e8183611050565b5b505050565b81600160005b50805491909101905580600260005b50805490910190555b5050565b600081600a81116100005714156110745781600160005b50805490910190556105b1565b600181600a81116100005714156110985781600260005b50805490910190556105b1565b600281600a81116100005714156110bc5781600360005b50805490910190556105b1565b600381600a81116100005714156110e05781600460005b50805490910190556105b1565b600481600a81116100005714156111045781600560005b50805490910190556105b1565b600581600a81116100005714156111285781600660005b50805490910190556105b1565b600681600a811161000057141561114c5781600760005b50805490910190556105b1565b600781600a81116100005714156111705781600860005b50805490910190556105b1565b600881600a81116100005714156111945781600960005b50805490910190556105b1565b600981600a81116100005714156111b85781600a60005b50805490910190556105b1565b600a81600a81116100005714156105b15781600b60005b50805490910190556105b1565b5b505056",
    "events": {},
    "updated_at": 1481357558642
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

  Contract.contract_name   = Contract.prototype.contract_name   = "regaMember";
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
    window.regaMember = Contract;
  }
})();
