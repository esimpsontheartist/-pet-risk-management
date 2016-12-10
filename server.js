#!/bin/env node
//  OpenShift sample Node application
var express 	= require('express');
var fs      	= require('fs');
var mongodb 	= require('mongodb');

var nodemailer 	= require('nodemailer');
var bodyParser	= require('body-parser');

var jade 		    = require('jade');
var dateFormat 	= require('dateformat');

var util  = require('util');
var rufus = require('rufus');

var Web3  = require('web3');
var web3  = new Web3();

//create application/json parser 
var jsonParser 			= bodyParser.json()

var HookedWeb3Provider  = require('hooked-web3-provider');
 
// create application/x-www-form-urlencoded parser 
var urlencodedParser 	= bodyParser.urlencoded({ extended: true })

//create reusable transporter object using SMTP transport
var transporter 		= nodemailer.createTransport({
	host: 'smtp.mailgun.org',
	auth: {
		user: 'postmaster@mg.sos-ka.com',
		pass: '4a2eba988d7d49ff8df89bad7068f704'
	}
});

var MongoClient = mongodb.MongoClient;

//NB! No need to recreate the transporter object. You can use
//the same transporter object for all e-mails

//setup e-mail data with unicode symbols
var mailOptions 		= {
		from:'<order@sos-ka.com>',							// sender address
		sender:'<order@sos-ka.com>',
		replyTo:'<order@mg.sos-ka.com>',
		to:'order@mg.sos-ka.com', 							// list of receivers
		cc:'order@mg.sos-ka.com',
		subject:'New Order #', 								// Subject line
		text:'Hello world from SOS-ka.com', 				// plaintext body
		html: '<b>Hello world from SOS-ka.com</b>' 			// html body
};

/**
 *  Define the sample application.
 */
var SampleApp = function() {

    //  Scope.
    var self = this;


    /*  ================================================================  */
    /*  Helper functions.                                                 */
    /*  ================================================================  */

    /**
     *  Set up server IP address and port # using env variables/defaults.
     */
    self.setupVariables = function() {
    	
        //  Set the environment variables we need.
        self.ipaddress 			= process.env.OPENSHIFT_NODEJS_IP;
        self.port      			= process.env.OPENSHIFT_NODEJS_PORT || 8080;
        self.connection_string  = '127.0.0.1:27017/OpenShift-Sample-App';
        
        if(process.env.OPENSHIFT_MONGODB_DB_PASSWORD) {
        	  self.connection_string = process.env.OPENSHIFT_MONGODB_DB_USERNAME + ":" +
        	  process.env.OPENSHIFT_MONGODB_DB_PASSWORD + "@" +
        	  process.env.OPENSHIFT_MONGODB_DB_HOST + ':' +
        	  process.env.OPENSHIFT_MONGODB_DB_PORT + '/' +
        	  process.env.OPENSHIFT_APP_NAME;
        }

        if (typeof self.ipaddress === "undefined") {
            //  Log errors on OpenShift but continue w/ 127.0.0.1 - this
            //  allows us to run/test the app locally.
            console.warn('No OPENSHIFT_NODEJS_IP var, using 127.0.0.1');
            self.ipaddress = "127.0.0.1";
        };
    };


    /**
     *  Populate the cache.
     */
    self.populateCache = function() {
        if (typeof self.zcache === "undefined") {
            self.zcache = { 'index.html': '', 'mail.html': '' };
        }

        //  Local cache for static content.
        self.zcache['index.html'] = fs.readFileSync('./index.html');
        self.zcache['mail.html'] = fs.readFileSync('./views/minty/index.html');
    };


    /**
     *  Retrieve entry (content) from cache.
     *  @param {string} key  Key identifying content to retrieve from cache.
     */
    self.cache_get = function(key) { return self.zcache[key]; };


    /**
     *  terminator === the termination handler
     *  Terminate server on receipt of the specified signal.
     *  @param {string} sig  Signal to terminate on.
     */
    self.terminator = function(sig){
        if (typeof sig === "string") {
           console.log('%s: Received %s - terminating sample app ...',
                       Date(Date.now()), sig);
           process.exit(1);
        }
        console.log('%s: Node server stopped.', Date(Date.now()) );
    };


    /**
     *  Setup termination handlers (for exit and a list of signals).
     */
    self.setupTerminationHandlers = function(){
        //  Process on exit and signals.
        process.on('exit', function() { self.terminator(); });

        // Removed 'SIGPIPE' from the list - bugz 852598.
        ['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGILL', 'SIGTRAP', 'SIGABRT',
         'SIGBUS', 'SIGFPE', 'SIGUSR1', 'SIGSEGV', 'SIGUSR2', 'SIGTERM'
        ].forEach(function(element, index, array) {
            process.on(element, function() { self.terminator(element); });
        });
    };
    
    /* MongoDb helpers													  */
    /* shop.users collection											  */
    
    self.insertNewUser = function(user) {
    	
    };


    /*  ================================================================  */
    /*  App server functions (main app logic here).                       */
    /*  ================================================================  */

    /**
     *  Create the routing table entries + handlers for the application.
     */
    self.createRoutes = function() {
        self.routes = { };

        self.routes['/asciimo'] = function(req, res) {
            var link = "http://i.imgur.com/kmbjB.png";
            res.send("<html><body><img src='" + link + "'></body></html>");
        };

        self.routes['/'] = function(req, res) {
        	console.log('/SEND redirect');
           	res.redirect(301, 'https://www.sos-ka.com/index.html');
            //res.setHeader('Content-Type', 'text/html');
            //res.send(self.cache_get('index.html') );
        };
        
        self.routes['/index.html/#/products'] = function(req, res) {
            res.setHeader('Content-Type', 'text/html');
            res.send(self.cache_get('index.html') );
        };
        
        self.routes['/auth'] = function(req, res) {
        	console.log('/auth');
        	res.redirect(301, url);
        };
        
        self.routes['/users'] = function(req, res) {
        	console.log('/users');
        	
        	MongoClient.connect('mongodb://'+ self.connection_string, function(err, db) {
            	  if(err) { return res.status(500).json({status:"error", message:err }); }
            	  
            	  var coll	= db.collection('shop.users');
          		  
            	  coll.find().toArray(function(err, docs) {
            		  if(err) { return res.status(500).json({status:"error", message:err }); }
            		  
            		  var count 	= docs.length;
            		  var result	= [];
            		  var number	= 0;
            		  
            		  for(i = 0; i < count; i++) {
            			
            			  var user		= {};
            			  
            			  user.firstname 	= docs[i].firstname;
            			  user.lastname		= docs[i].lastname;
            			  user.username		= docs[i].username;
            			  
            			  if(user.username) {
            				  result.push(user.username);
            				  number++;
            			  }
            		  }
            		  
            		  console.log('/api/userlist/user count : %d', count );
            		  res.status(200).json({status:"ok", number:number, users:result});  
            		  db.close();
            	  })
          	})
        };
        
        self.routes['/list'] = function(req, res) {
        	console.log('/list');
        	content.products.list({ merchantId: MERCHANT_ID }, function(err, response) {
        		// handle err and response
        		if(err) {
        			console.log('/list error: ', err.message);
        			res.status(202).json({status:"error", message:err.message });
        		}
        		else {
        			res.status(200).json({status:"ok", result: response });
        		}
        	});
        };
        
        self.routes['/mail'] = function(req, res) {
        	
        	console.log('/mail');
        	
        	// Sending mail
          	mailOptions['subject']	= 'SOS-ka Shop Info';
          	mailOptions['to']		= 'test@mg.sos-ka.com';
        	mailOptions['text'] 	= '';
        	mailOptions['html'] 	= self.cache_get('mail.html');
        	mailOptions['cc'] 		= '';
          				  
          	//send mail with defined transport object
          	transporter.sendMail(mailOptions, function(error, info) {
          		if(error) {
          			return console.log(error);
          		}
          		console.log('Message sent: ' + info.response);
          	});
          	
          	res.setHeader('Content-Type', 'text/html');
            res.send(self.cache_get('mail.html') );
        	
        };
    };

    self.redirectSec = function(req, res, next) {
    	  if (req.headers['x-forwarded-proto'] == 'http') {
    	      res.redirect('https://' + req.headers.host + req.path);
    	  } else {
    	      return next();
    	  }
    };
    
    /**
     *  Initialize the server (express) and create the routes and register
     *  the handlers.
     */
    self.initializeServer = function() {
        self.createRoutes();
        self.app = express();

        //  Add handlers for the app (from the routes).
        for (var r in self.routes) {
            self.app.get(r, self.routes[r]);
        }
        
        self.app.get('/api/OAuth2', urlencodedParser, function(req, res) {
        	console.log('/GET request to /api/OAuth2');
        	console.log(req.query.code);
        	
        	oauth2Client.getToken(req.query.code, function(err, tokens) {
        		  // Now tokens contains an access_token and an optional refresh_token. Save them.
        		  if(!err) {
        		    oauth2Client.setCredentials(tokens);
        		    console.log('setCredentials(tokens) tokens:', tokens);
        		    res.redirect(301, "#/products");
        		  }
        		  else {
        			  console.log('setCredentials(tokens) error:', err);
        			  res.status(202).json({status:"error", message:err.message });
        		  }
        	});
        });
        
        self.app.post('/api/orders', jsonParser, function(req, res) {
        	console.log('/POST request to /api/orders');
        	
        	var user = {};
    		
        	user.username	= req.body.username;
        	
        	console.log('/api/orders/loading orders for user : ', user.username);
        	
        	MongoClient.connect('mongodb://'+ self.connection_string, function(err, db) {
          	  if(err) { return res.status(500).json({status:"error", message:err }); }
        		  
          	  var select 		= {};
          	  var coll			= db.collection('shop.orders');
          	  select.username 	= user.username;
          	  
          	  if(user.username == 'admin' || user.username == 'sevriugin@gmail.com' || user.username == 'sevriugina@gmail.com') {
          		  select = {};
          	  }
        		  
          	  coll.find(select).toArray(function(err, docs) {
          		  if(err) { return res.status(500).json({status:"error", message:err }); }
          		  
          		  var count = docs.length;
          		  console.log('/api/orders/number of orders : %d', count );
          		  console.log(util.format("%j", docs));
        			  
          		  if(count > 0) {
          			  res.status(200).json({status:"ok", orders:docs});
          		  }
          		  else {
          			  res.status(202).json({status:"error", message:"No orders selected" });
          		  }
          		  db.close();
          	  })
        	})	
        });
        
        self.app.post('/api/order', jsonParser, function(req, res) {
        	console.log('/POST request to /api/order');
        	
        	var invoice 	= {};
        	var imgPath		= 'http://bimbi-yabe.rhcloud.com/';
        		
        	invoice		 	= req.body.invoice;
        	
        	if(req.body.invoice.updateId) {
        		invoice.id	= req.body.invoice.updateId + '*';
        	}
        	else {
        		invoice.id	= 'Order #' + req.body.invoice.phone + '-' + dateFormat(Date.now(),"yyyy-mm-dd hh:MM");
        	}
        	
        	for (var i = 0, len = invoice.items.length; i < len; i++) {
        		invoice.items[i].imgUrl	= imgPath + invoice.items[i].imgUrl;
        		
        		console.log('--- imgUrl : ', invoice.items[i].imgUrl);
        	}
        	
        	if(!invoice.username) {
        		invoice.username = 'UNREGISTERED';
        	}
        	
        	console.log('Place new order from : ', invoice.username);
        	
        	MongoClient.connect('mongodb://'+ self.connection_string, function(err, db) {
          	  if(err) { return res.status(500).json({status:"error", message:err }); }
        		  
          	  var select 		= {};
          	  var coll			= db.collection('shop.orders');
          	  select.email	 	= invoice.email;
        		  
          	  coll.find(select).count(function(err, count) {
          		  if(err) { return res.status(500).json({status:"error", message:err }); }
          		  console.log('/api/order/user order count : %d', count );
        			  
          		  coll.insertOne(invoice, function(err, r) {
          			  if(err) { return res.status(500).json({status:"error", message:err }); }
          			  console.log('/api/order/order inserted : %d', r.insertedCount );

          			  // Compile a function
          			  var fn = jade.compileFile('./views/order_email.jade');

          			  // Render the function
          			  var html = fn({invoice:invoice, count:count + 1});
          				  
          			  // Sending mail
          			  mailOptions['subject']	= invoice.id;
          			  mailOptions['html'] 		= html;
          			  mailOptions['to']			= invoice.email;
          			  mailOptions['cc']			= 'order@mg.sos-ka.com';
          				  
          			  //send mail with defined transport object
          			  transporter.sendMail(mailOptions, function(error, info) {
          				  if(error) {
          					  	return console.log(error);
          				  }
          				  		console.log('Message sent: ' + info.response);
          			  });
          				  
          			  res.status(200).json({status:"ok"});
          			  db.close();
          		  })
          	  })
        	})
        });
        

        self.app.post('/api/getgas', jsonParser, function(req, res) {
          console.log('/POST request to /api/getgas');

          var user = {};

          user.username = req.body.username;
          user.address  = req.body.address;
          user.prvtkey  = req.body.prvtkey;
          user.host   = req.body.host;

          console.log('/api/getgas/user : ', user);

          web3.setProvider(new web3.providers.HttpProvider(user.host));
          web3.eth.defaultAccount = web3.eth.coinbase;

          console.log('/api/getgas/web3 : ', web3);

          MongoClient.connect('mongodb://'+ self.connection_string, function(err, db) {
              if(err) { return res.status(500).json({status:"error", message:err }); }

              var select    = {};
              var coll      = db.collection('rega.users');
              select.username   = user.username;

              coll.find(select).toArray(function(err, docs) {
                if(err) { return res.status(500).json({status:"error", message:err }); }

                var count = docs.length;
                console.log('/api/getgas/user count : %d', count );

                if(count > 0) {
                  web3.eth.sendTransaction({to:user.address, value: web3.toWei(0.1, "ether")}, function(error, result) {
                    if(!error) {
                    console.log('/api/getgas/sendTransaction: ', result);
                    res.status(200).json({status:"ok", tnx: result});
                    }
                    else {
                    console.log('/api/getgas/sendTransaction errror: ', error);
                    res.status(500).json({status:"error", message:error });
                    }
                  });
                }
                else {
                  res.status(202).json({status:"error", message:"User is not registred" });
                }
                db.close();
              });
          });
        });

        self.app.post('/api/sendpassword', jsonParser, function(req, res) {
        	console.log('/POST request to /api/sendpassword');
        	
        	var user = {};
    		
        	user.username	= req.body.username;
        	user.password	= req.body.password;
        	user.authdata	= req.body.authdata;
        	
        	console.log('api/sendpassword/user : ', user);
        	
        	MongoClient.connect('mongodb://'+ self.connection_string, function(err, db) {
          	  if(err) { return res.status(500).json({status:"error", message:err }); }
        		  
          	  var select 		= {username:user.username};
          	  var update		= {$set:{authdata:user.authdata}};
          	  var coll			= db.collection('shop.users');
        		  
          	  coll.updateOne(select, update, function(err, r) {
          		  if(err) { return res.status(500).json({status:"error", message:err }); }
          		  console.log('api/sendpassword/user : %d', r.modifiedCount );

          		  // Compile a function
          		  var fn = jade.compileFile('./views/sendpassword_email.jade');

          		  // Render the function
          		  var html = fn({user:user});
         				  
          		  // Sending mail
          		  mailOptions['subject']	= 'New password';
          		  mailOptions['html'] 		= html;
          		  mailOptions['to']			= user.username;
          		  mailOptions['cc']			= '';
         				  
          		  //send mail with defined transport object
          		  transporter.sendMail(mailOptions, function(error, info) {
          			  if(error) {
          				  return console.log(error);
          			  }
          			  else {
          				  console.log('Message sent: ' + info.response);
          			  }
          		  });	  
          		  res.status(200).json({status:"ok"});
          		  db.close();
          	  })
        	})
        });
        
        
        self.app.post('/api/authenticate', jsonParser, function(req, res) {
        	console.log('/POST request to /api/authenticate');
        	
        	var user = {};
    		
        	user.username	= req.body.username;
        	user.authdata	= req.body.authdata;
        	
        	console.log('/api/authenticate/login user : ', user);
        	
        	MongoClient.connect('mongodb://'+ self.connection_string, function(err, db) {
          	  if(err) { return res.status(500).json({status:"error", message:err }); }
        		  
          	  var select 		= {};
          	  var coll			= db.collection('shop.users');
          	  select.username 	= user.username;
        		  
          	  coll.find(select).toArray(function(err, docs) {
          		  if(err) { return res.status(500).json({status:"error", message:err }); }
          		  
          		  var count = docs.length;
          		  console.log('/api/authenticate/user count : %d', count );
        			  
          		  if(count > 0) {
          			  if(docs[0].authdata === user.authdata) {
          				  res.status(200).json({status:"ok"});
          			  }
          			  else {
          				res.status(202).json({status:"error", message:"Invalid password" });
          			  }
          		  }
          		  else {
          			  res.status(202).json({status:"error", message:"User is not registred" });
          		  }
          		  db.close();
          	  })
        	})
        	
        });
        
        self.app.post('/api/registration', jsonParser, function(req, res) {
        	console.log('/POST request to /api/registration');
        	
        	var user = {};
        		
        	user.firstname 	= req.body.firstname;
        	user.lastname	= req.body.lastname;
        	user.username	= req.body.username;
        	user.authdata	= req.body.authdata;
        		
        	console.log('Adding new user : ', user);
        	
        	MongoClient.connect('mongodb://'+ self.connection_string, function(err, db) {
          	  if(err) { return res.status(500).json({status:"error", message:err }); }
        		  
          	  var select 		= {};
          	  var coll			= db.collection('shop.users');
          	  select.username 	= user.username;
        		  
          	  coll.find(select).count(function(err, count) {
          		  if(err) { return res.status(500).json({status:"error", message:err }); }
          		  console.log('/api/registration/user count : %d', count );
        			  
          		  if(count == 0) {
          			  coll.insertOne(user, function(err, r) {
          				  if(err) { return res.status(500).json({status:"error", message:err }); }
          				  console.log('/api/registration/user inserted : %d', r.insertedCount );

          				  // Compile a function
          				  var fn = jade.compileFile('./views/registration_email.jade');

          				  // Render the function
          				  var html = fn({user:user});
          				  
          				  // Sending mail
          				  mailOptions['subject']	= 'New registration';
          				  mailOptions['html'] 		= html;
          				  mailOptions['to']			= user.username;
          				  mailOptions['cc']			= 'order@mg.sos-ka.com';
          				  
          				  //send mail with defined transport object
          				  transporter.sendMail(mailOptions, function(error, info) {
          					  if(error) {
          						  return console.log(error);
          					  }
          					  console.log('Message sent: ' + info.response);
          				  });
          				  
          				  res.status(200).json({status:"ok"});
          				  db.close();
          			  })
          		  }
          		  else {
          			res.status(202).json({status:"error", message:"User already exists" });
          		  }
          	  })
        	})
        });
        
        self.app.post('/api/comments', jsonParser, function(req, res) {
        	console.log('/POST request to /api/comments');
        	
        	MongoClient.connect('mongodb://'+ self.connection_string, function(err, db) {
          	  if(err) { return res.status(500).json({status:"error", message:err }); }
        		  
          	  var select 		= {};
          	  var coll			= db.collection('shop.comments');
          	    
          	  coll.find(select).toArray(function(err, docs) {
          		  if(err) { return res.status(500).json({status:"error", message:err }); }
          		  
          		  var count = docs.length;
          		  console.log('/api/comments/number of comments : %d', count );
        			  
          		  if(count > 0) {
          			  res.status(200).json({status:"ok", comments:docs});
          		  }
          		  else {
          			  res.status(202).json({status:"error", message:"No comments selected" });
          		  }
          		  db.close();
          	  })
        	})	
        });
       
        self.app.post('/api/comment', jsonParser, function(req, res) {
        	console.log('/POST request to /api/comment');
        	
        	var comment 		= {};
    		
        	comment.id			= req.body.comment.article.id;
        	comment.likes		= 1;
        	comment.comments	= 1;
        	comment.messages	= [{user:req.body.comment.email, message:req.body.comment.message}];
        	
        	console.log('api/comment/comment : ', comment);
        	
        	MongoClient.connect('mongodb://'+ self.connection_string, function(err, db) {
        		if(err) { return res.status(500).json({status:"error", message:err }); }
        		
        		var select 		= {id:comment.id};
          	  	var update		= {$inc:{likes:1, comments:1}, $push:{messages:comment.messages[0]}};
          	  	var coll		= db.collection('shop.comments');
        	
          	  	coll.find(select).toArray(function(err, docs) {
          	  		if(err) { return res.status(500).json({status:"error", message:err }); }
          	  		
          	  		var count = docs.length;
          	  		console.log('/api/comment/comment find count : %d', count );
          	  		
          	  		if(count == 0) {
          	  			// insert new comment
          	  			coll.insertOne(comment, function(err, r) {
          	  				if(err) { return res.status(500).json({status:"error", message:err }); }
          	  				console.log('/api/comment/comment inserted : %d', r.insertedCount );

          	  				// Sending mail
          	  				mailOptions['subject']	= 'New comment for ' + req.body.comment.article.title;
          	  				mailOptions['to']		= 'order@mg.sos-ka.com';
          	  				mailOptions['html'] 	= req.body.comment.message;
          	  				mailOptions['replyTo'] 	= req.body.comment.email;
          	  				mailOptions['cc'] 		= '';
            				  
          	  				//send mail with defined transport object
          	  				transporter.sendMail(mailOptions, function(error, info) {
          	  					if(error) {
          	  						return console.log(error);
          	  					}
          	  					console.log('Message sent: ' + info.response);
          	  				});
          	  				res.status(200).json({status:"ok"});
          	  				db.close();
      	  				})
          	  		}
          	  		else {
          	  			console.log('/api/comment/comment before update : ', docs[0] );
          	  			// update selected comment
          	  			coll.updateOne(select, update, function(err, r) {
          	  				if(err) { return res.status(500).json({status:"error", message:err }); }
          	  				console.log('api/comments/comment updated : %d', r.modifiedCount );

          	  				// Sending mail
          	  				mailOptions['subject']	= 'New comment for ' + req.body.comment.article.title;
          	  				mailOptions['to']		= 'order@mg.sos-ka.com';
          	  				mailOptions['html'] 	= req.body.comment.message;
          	  				mailOptions['replyTo'] 	= req.body.comment.email;
          	  				mailOptions['cc'] 		= '';
                				  
          	  				//send mail with defined transport object
          	  				transporter.sendMail(mailOptions, function(error, info) {
          	  					if(error) {
          	  						return console.log(error);
          	  					}
          	  					console.log('Message sent: ' + info.response);
          	  				});
          	  				res.status(200).json({status:"ok"});
          	  				db.close();
          	  			})
          	  		}
          	  	})
        	})
        });
        
        self.app.post('/api/contactmsg', jsonParser, function(req, res) {
        	console.log('/POST request to /api/contactmsg');
        				  
          	// Sending mail
          	mailOptions['subject']	= 'Message from ' + req.body.contact.firstname + ' ' + req.body.contact.lastname + ' ' + req.body.contact.phone;
          	mailOptions['to']		= 'order@mg.sos-ka.com';
        	mailOptions['html'] 	= req.body.contact.message;
        	mailOptions['replyTo'] 	= req.body.contact.email;
        	mailOptions['cc'] 		= '';
          				  
          	//send mail with defined transport object
          	transporter.sendMail(mailOptions, function(error, info) {
          		if(error) {
          			return console.log(error);
          		}
          		console.log('Message sent: ' + info.response);
          	});
          	
          	res.status(200).json({status:"ok"});
        });
        
        self.app.post('/api/yml', jsonParser, function(req, res) {
        	console.log('/POST request to /api/yml');
        	
        	var xml_date = dateFormat(Date.now(),"yyyy-mm-dd hh:MM");
        	var products = req.body.products;
        	// Compile a function
			var fn = jade.compileFile('./views/yml.jade');

			// Render the function
			var xml = fn({date:xml_date, products:products});
        	
          	// Sending mail
          	mailOptions['subject']	= 'YML SOS-ka Shop';
          	mailOptions['to']		= 'test@mg.sos-ka.com';
        	mailOptions['text'] 	= xml;
        	mailOptions['html'] 	= '';
        	mailOptions['cc'] 		= '';
          				  
          	//send mail with defined transport object
          	transporter.sendMail(mailOptions, function(error, info) {
          		if(error) {
          			return console.log(error);
          		}
          		console.log('Message sent: ' + info.response);
          	});
          	
          	res.status(200).json({status:"ok"});
        }); 
        
        
        self.app.post('/api/sendtogoogle', jsonParser, function(req, res) {
        	console.log('/POST request to /api/sendtogoogle');
        	console.log(req.body.product);			  
          	// main action place here
        	// update path
        	
        	var appPath			= 'http://www.sos-ka.com/';
        	var product 		= req.body.product;
        	product.link		= appPath + product.link;
        	product.imageLink	= appPath + product.imageLink;
        	
        	content.products.insert({ merchantId: MERCHANT_ID, resource: product }, function(err, response) {
        		// handle err and response
        		if(err) {
        			console.log('/insert error: ', err.message);
        			res.status(202).json({status:"error", message:err.message });
        		}
        		else {
        			console.log('/insert : ', response);
        			res.status(200).json({status:"ok", result: response });
        		}
        	});
        });
        
        
      //serve static assets
      self.app.use(express.static(__dirname +'/'));
      
    };


    /**
     *  Initializes the sample application.
     */
    self.initialize = function() {
        self.setupVariables();
        self.populateCache();
        self.setupTerminationHandlers();

        // Create the express server and routes.
        self.initializeServer();
    };
      
    /**
     *  Start the server (starts up the sample application).
     */
    self.start = function() {
        //  Start the app on the specific interface (and port).
        self.app.listen(self.port, self.ipaddress, function() {
            console.log('%s: Node server started on %s:%d ...',
                        Date(Date.now() ), self.ipaddress, self.port);
        });
    };

};   /*  Sample Application.  */



/**
 *  main():  Main code.
 */
var zapp = new SampleApp();
zapp.initialize();
zapp.start();

