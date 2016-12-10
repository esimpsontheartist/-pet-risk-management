var express = require('express');
var router = express.Router();

/* GET users listing. */
router.get('/', function(req, res, next) {
  res.status(200).json({status:"ok", token:'auth.oauth2.1234567890'});
});

module.exports = router;
