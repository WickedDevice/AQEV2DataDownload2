var expressPromiseRouter = require("express-promise-router");
var router = expressPromiseRouter();

/* GET home page. */
router.get('/', function(req, res) {
  //res.render('index', { title: 'Express' });
  res.redirect('/download');
});

module.exports = router;
