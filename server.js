const express = require("express");
var cors = require("cors");
const AWS = require("aws-sdk");
var mysql = require("mysql");
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");
var multer = require("multer");
var multerS3 = require("multer-s3");
const saltRounds = 10;
let jwt = require("jsonwebtoken");
let config = require("./config");
let middleware = require("./middleware");
var s3 = new AWS.S3();
var S3Zipper = require("aws-s3-zipper");
var zipper = new S3Zipper({ bucket: "frmnjn-filedrop" });

var connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "filedrop"
});

connection.connect();

class HandlerGenerator {
  login(req, res) {
    let username = req.body.username;
    let password = req.body.password;
    if (username && password) {
      connection.query(
        "SELECT `id`,`name`,`username`,`email` FROM `user` WHERE `username` = ?",
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

  editaccount(req, res) {
    let id = req.body.id;
    let name = req.body.name;
    let username = req.body.username;
    let email = req.body.email;

    connection.query(
      "UPDATE `user` SET `name` = ?,`username` = ?,`email` = ? WHERE `id` = ?",
      [name, username, email, id],
      function(error, results, fields) {
        if (error) throw error;
        console.log(results);
        res.json({
          success: true,
          message: "Account Updated",
          results: results
        });
      }
    );
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
    let ownerUsername = req.body.ownerUsername;
    let dropLinkName = req.body.dropLinkName;
    connection.query(
      "INSERT INTO `droplink` (ownerUsername, name) VALUES(?, ?);",
      [ownerUsername, dropLinkName],
      function(error, results, fields) {
        if (error) {
          console.log(error);
          res.json({
            success: false,
            message: error
          });
        } else {
          console.log(results);
          res.json({
            success: true,
            message: "Create Drop Link successful!"
          });
        }
      }
    );
  }

  checkdroplink(req, res) {
    let username = req.body.ownerUsername;
    let folder = req.body.droplink;

    connection.query(
      "SELECT 1 FROM `droplink` WHERE `name` = ? AND `ownerUsername`= ?",
      [folder, username],
      function(error, results, fields) {
        if (error) throw error;
        //console.log(results);
        if (results[0] != null) {
          res.json({
            success: true
          });
        } else {
          res.json({
            success: false
          });
        }
      }
    );
  }

  getdroplinks(req, res) {
    let ownerUsername = req.body.ownerUsername;

    connection.query(
      "SELECT id,name FROM `droplink` WHERE `ownerUsername` = ?",
      [ownerUsername],
      function(error, results, fields) {
        if (error) throw error;
        //console.log(results);
        if (results[0] != null) {
          res.json({
            success: true,
            droplinks: results
          });
        } else {
          res.json({
            success: false,
            message: "There are no droplinks"
          });
        }
      }
    );
  }

  getlistfiles(req, res) {
    var params = {
      Bucket: "frmnjn-filedrop",
      Prefix: req.body.username + "/" + req.body.folder + "/"
    };

    console.log(params);

    s3.listObjects(params, function(err, data) {
      if (err) {
        res.json({
          data: err.message,
          success: false
        });
      } else {
        if (data.Contents[0] != null) {
          res.json({
            data: data.Contents,
            success: true
          });
          console.log("found ", data.Contents.length, " data");
        } else {
          res.json({
            data: "there is no data",
            success: false
          });
          console.log("found ", data.Contents.length, " data");
        }
      }
    });
  }

  index(req, res) {
    res.json({
      success: true,
      message: "Index page"
    });
  }

  downloadsinglefile(req, res) {
    const options = {
      Bucket: "frmnjn-filedrop",
      Key: req.body.Key,
      Expires: 60 // one hour expires.
    };

    const url = s3.getSignedUrl("getObject", options);
    // const url =
    //   "http://d31dnmp7lgwbvu.cloudfront.net/frmnjn/uhuy/1565921286179-arsi.png";
    console.log("url", url);
    res.redirect(302, url);
  }

  downloadallfiles(req, res) {
    res.set("content-type", "application/zip"); // optional
    zipper.streamZipDataTo(
      {
        pipe: res,
        folderName: req.params.username + "/" + req.params.folder,
        // startKey: "keyOfLastFileIZipped", // could keep null
        recursive: true
      },
      function(err, result) {
        if (err) console.error(err);
        else {
          console.log(result);
        }
      }
    );
    // response.download();
  }

  deletefile(req, res) {
    var params = {
      Bucket: "frmnjn-filedrop",
      Key: req.body.Key
    };

    s3.deleteObject(params, function(err, data) {
      if (err) console.log(err, err.stack);
      else {
        console.log(data);
        res.json({ success: true, data: data });
      }
    });
  }

  deleteAllfiles(req, res) {
    var params = {
      Bucket: "frmnjn-filedrop" /* required */,
      Delete: {
        /* required */
        Objects: req.body.Key,
        Quiet: true || false
      }
    };

    s3.deleteObjects(params, function(err, data) {
      if (err) {
        console.log(err, err.stack);
        res.json({
          success: false,
          message: err
        });
      } else {
        console.log(params.Delete.Objects.length, " deleted"); // successful response
        res.json({
          success: true,
          message: params.Delete.Objects.length + " deleted"
        });
      }
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
  app.use(
    cors({
      exposedHeaders: "*"
    })
  );

  var upload = multer({
    storage: multerS3({
      s3: s3,
      bucket: "frmnjn-filedrop",
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

  var storageLocal = multer.diskStorage({
    destination: function(req, file, cb) {
      cb(null, "./uploads");
    },
    filename: function(req, file, cb) {
      cb(null, Date.now() + "-" + file.originalname);
    }
  });

  var uploadLocal = multer({ storage: storageLocal });

  // Routes & Handlers
  app.post("/login", handlers.login);
  app.post("/register", handlers.register);
  app.get("/checkToken", middleware.checkToken, handlers.index);
  app.post("/checkdroplink", handlers.checkdroplink);
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
  app.post("/getdroplinks", handlers.getdroplinks);
  app.post("/getlistfiles", handlers.getlistfiles);
  app.post("/editaccount", handlers.editaccount);
  app.post("/downloadsinglefile", handlers.downloadsinglefile);
  app.post("/downloadallfiles", handlers.downloadallfiles);
  app.delete("/deletefile", handlers.deletefile);
  app.delete("/deleteallfiles", handlers.deleteAllfiles);
  app.post(
    "/uploadmultiple",
    uploadLocal.array("file", 12),
    (req, res, next) => {
      const files = req.files;
      if (!files) {
        const error = new Error("Please choose files");
        error.httpStatusCode = 400;
        return next(error);
      }

      res.send(files);
    }
  );

  app.get("/download/:username/:folder", handlers.downloadallfiles);

  app.listen(port, () => console.log(`Server is listening on port: ${port}`));
}

main();
