var compression = require('compression');
var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var cors = require('cors');

//var routes = require('./routes/index');
var download = require('./routes/download');

var app = express();
app.use(compression());
// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'node_modules/bootstrap/dist')));
app.use(express.static(path.join(__dirname, 'node_modules/html5shiv/dist')));
app.use(express.static(path.join(__dirname, 'node_modules/jquery/dist')));
app.use(express.static(path.join(__dirname, 'node_modules/angular')));
app.use(express.static(path.join(__dirname, 'node_modules/angular-route')));
app.use(express.static(path.join(__dirname, 'node_modules/angular-resource')));
app.use(express.static(path.join(__dirname, 'node_modules/angular-material')));
app.use(express.static(path.join(__dirname, 'node_modules/angular-aria')));
app.use(express.static(path.join(__dirname, 'node_modules/angular-animate')));
app.use(express.static(path.join(__dirname, 'node_modules/angular-touch')));
app.use(express.static(path.join(__dirname, 'node_modules/angular-material-datetimepicker/js')));
app.use(express.static(path.join(__dirname, 'node_modules/angular-material-datetimepicker/css')));
app.use(express.static(path.join(__dirname, 'node_modules/angular-material-datetimepicker/font')));
app.use(express.static(path.join(__dirname, 'node_modules/moment')));

//app.use('/', routes);
app.use('/', download);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});


module.exports = app;
