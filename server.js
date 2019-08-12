const express = require("express");
var cors = require("cors");
const AWS = require("aws-sdk");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
var multer = require("multer");
var multerS3 = require("multer-s3");
const saltRounds = 10;
let jwt = require("jsonwebtoken");
let config = require("./config");
let middleware = require("./middleware");
var connection = require("./conn");
var s3 = new AWS.S3();

class HandlerGenerator {
  login(req, res) {
    let username = req.body.username;
    let password = req.body.password;
    if (username && password) {
      connection.query(
        "SELECT * FROM `user` WHERE `username` = ?",
        [username],
        function(error, results, fields) {
          if (error) throw error;
          console.log(results);
          if (results[0] != null) {
            bcrypt.compare(password, results[0].password, function(err, valid) {
              //valid = boolean
              let token = jwt.sign({ username: username }, config.secret, {
                expiresIn: "24h" // expires in 24 hours
              });
              // return the JWT token for the future API calls
              res.json({
                success: true,
                message: "Authentication successful!",
                token: token,
                user: results[0]
              });
            });
          } else {
            res.json({
              success: false,
              message: "Incorrect username or password!"
            });
          }
        }
      );
    } else {
      res.send(400).json({
        success: false,
        message: "Authentication failed! Please check the request"
      });
    }
  }

  register(req, res) {
    let name = req.body.name;
    let username = req.body.username;
    let email = req.body.email;
    const plainpassword = req.body.password;
    bcrypt.hash(plainpassword, saltRounds, function(err, hash) {
      console.log(hash);
      connection.query(
        "INSERT INTO `user` (name, username, email, password) VALUES(?, ?, ?, ?);",
        [name, username, email, hash],
        function(error, results, fields) {
          if (error) throw error;
          console.log(results);
          connection.query(
            "SELECT `id`,`name`,`username`,`email` FROM `user` WHERE `id` = ?",
            [results.insertId],
            function(error, results, fields) {
              if (error) throw error;
              console.log(results);
              res.json({
                success: true,
                message: "Register successful!",
                user: results[0]
              });
            }
          );
        }
      );
    });
  }

  createdroplink(req, res) {
    let ownerId = req.body.ownerId;
    let dropLinkName = req.body.dropLinkName;
    connection.query(
      "INSERT INTO `droplink` (ownerId, name) VALUES(?, ?);",
      [ownerId, dropLinkName],
      function(error, results, fields) {
        if (error) throw error;
        console.log(results);
        res.json({
          success: true,
          message: "Create Drop Link successful!"
        });
      }
    );
  }

  index(req, res) {
    res.json({
      success: true,
      message: "Index page"
    });
  }
}

// Starting point of the server
function main() {
  let app = express(); // Export app for other routes to use
  let handlers = new HandlerGenerator();
  const port = process.env.PORT || 8000;
  app.use(
    bodyParser.urlencoded({
      // Middleware
      extended: true
    })
  );
  app.use(bodyParser.json());
  app.use(cors());

  var upload = multer({
    storage: multerS3({
      s3: s3,
      bucket: "halohalohalo",
      acl: "public-read",
      contentType: multerS3.AUTO_CONTENT_TYPE,
      metadata: function(req, file, cb) {
        cb(null, { fieldName: file.fieldname });
      },
      key: function(req, file, cb) {
        cb(
          null,
          req.params.username +
            "/" +
            req.params.dropLink +
            "/" +
            Date.now().toString() +
            "-" +
            file.originalname
        );
        console.log("file " + file.originalname + " saved");
      }
    })
  });

  // Routes & Handlers
  app.post("/login", handlers.login);
  app.post("/register", handlers.register);
  app.get("/checkToken", middleware.checkToken, handlers.index);
  app.post("/drop/:username/:dropLink", upload.array("file", 3), function(
    req,
    res,
    next
  ) {
    //res.send('Successfully uploaded ' + req.files.length + ' files! '+res)
    res.json({
      success: true,
      data: req.files
    });
  });
  app.post("/createdroplink", handlers.createdroplink);

  app.listen(port, () => console.log(`Server is listening on port: ${port}`));
}

main();
