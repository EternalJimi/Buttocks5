// importing the modules we will need: Express for Server, Request for Client
var express = require('express'),
    app = express(),
    bodyParser = require('body-parser');
    app.use(bodyParser.json());


// 18.04: Dependencies, do not forget to use './' for files in same folder
var MasterRec = require('./MasterRec.js');
var ControlRec = require('./ControlRec.js');

var request = require('request');
 /* Recipe nodes reqests ( ~ control recipe)
  * as you can see here is a lot of repetition you can clear it up
  * This is a control rec. it has 1-1 mapping to equipment, this should be living
  * on scada level.
  * It is highly recommended to have as well a 'master recipe' which is not yet
  * binded to equipment (especially when you will go to Drawing operations)
  *
  * A perfect solution will be MES has a Site recipe
  * (e.g. 1. Load Pallet,
  *       2. Move to Paper loader,
  *       3. Move to first free WS,
  *       4. Draw frame
  *       5. Draw screen
  *       6. Draw kbd
  *       7. Move to load/unload station
  *       8. Unload product)
  *
  * This recipe can be given to transformed to Master Rec and given to SCADA:
  *  (e.g. 1. WS7 - Load Pallet
  *        2. WS8,9,10,11,12 - use bypass
  *        3. WS1 - Load Paper
  *        4. WS2 - Draw1, 4, 7
  *        5. WS3,4,5,6 - use bypass
  *        6. WS7 UnloadPallet, inform MES )
  *
  * The Master can be transfored to executable control process like the one we
  * have below
  */

/* this is the interface to higher level systems. It needs to be more flexible,
 * can have multiple recs
 * a great solution will have a CRUD for Master recipes
 * as well SCADA needs to inform upper levels about created products somehow
 */


/* 18.04:
* This is our temporary repository. You can also syncronize it with the database to keep it
* persistent
*/
var repo = {
  masterRecs: {},
  contorlRecs: {}
};


/* 18.04: --------------------------------------------------------------------------------------
* CRUD for master-recipes
* POST: obtains frame, screen and keyboard from the request body (you will need a body parser to
* make it work require('body-parser'))
*/
app.post("/master-recipes", function(req, res){
  //get data from body
  var frame = req.body.frame;
  var screen = req.body.screen;
  var keyboard = req.body.keyboard;

  // create MasterRec from data. You can add here error handling to avoid posting blob to user
  var mr = new MasterRec(frame, screen, keyboard);
  // put to the repository using MasterRec generated id
  // NOTE that using database you may need to invert it, so that repo will give you an id to
  // create the master
  repo.masterRecs[mr.id] = mr;
  // Return some hypermedia, e.g. the created object
  res.send({url:'/master-recipes/' + mr.id});
});

//GET all master recipe by id
app.get("/master-recipes", function(req, res){
  //should execute the first node. in this case loadPalletReq
  res.send(repo.masterRecs);
});

//GET master recipe by id
app.get("/master-recipes/:id", function(req, res){
  //here you can check as well if exists and return 404 on wrong id
  var id = req.params.id;
  // I have updated it to keep both the data and hypermedia
  var response = {
    data: repo.masterRecs[id],
    hypermedia: {
      createRec: {
        url: '/control-recipes?fromMaster=' + id,
        method: 'POST'
      }
    }
  }
  res.send(response);
});


//PUT: the master recipe to certain id
app.put("/master-recipes/:id", function(req, res){
  //should execute the first node. in this case loadPalletReq

  var id = req.params.id;

  var frame = req.body.frame;
  var screen = req.body.screen;
  var keyboard = req.body.keyboard;

  var mr = new MasterRec(frame, screen, keyboard);
  // same as in POST, but we already know ID
  repo.masterRecs[id] = mr;
  res.send();
});


//DELETE remove the master recipe
app.delete("/master-recipes/:id", function(req, res){
  //should execute the first node. in this case loadPalletReq

  var id = req.params.id;
  // Delete object
  delete repo.masterRecs[id];
  res.send();
});



// control recipes
// POST: create from master
app.post("/control-recipes", function(req, res){
  //some data from query
  var masterID = req.query.fromMaster;
  //some data from body
  var body = req.body;
  // new ControlRec, gettin the master by id. Consider checking if exists
  var cr = new ControlRec (repo.masterRecs[masterID], body);

  repo.contorlRecs[cr.id] = cr;
  // returning some hypermedia
  var response = {
    data: '/control-recipes/' + cr.id,
    hypermedia: {
      start: {
        url: '/control-recipes/' + cr.id + '?action=start',
        method: 'POST'
      }
    }
  }
  res.send(response);
});

//GET all control recipes
app.get("/control-recipes", function(req, res){
  res.send(repo.contorlRecs);
});

//GET control rec by id
app.get("/control-recipes/:id", function(req, res){
  //should execute the first node. in this case loadPalletReq
  var id = req.params.id;
  res.send(repo.contorlRecs[id]);
});

//POST action
app.post("/control-recipes/:id", function(req, res){
  //should execute the first node. in this case loadPalletReq
  var action = req.query.action;
  res.send(); // we can reply before we have finished, not to block the client.
  if(action === "start"){
    var id = req.params.id;
    execute(id,0);
  }

});
/**
* Execute method, runs the step of the control recipe defined by ids.
* uses the recipe executeStep function to get request url and destUrl postfix
* @param {String} id - the recipe id
* @param {Number} step - the step number
*/
var execute = function(id, step){
  // getting recipe ! check if exists`
  var rec = repo.contorlRecs[id];
  // getting execution details
  var exec = rec.executeStep(step);
  // creating reqiest details
  var options = {
    url: exec.url,
    method: "POST",
    //here we are using our server url:
    json:{destUrl: "http://localhost:2999/notifications/" + exec.callback} //
  }
  //logging request. just for debugging purposes, so that you can see if something goes wrong
  console.log(JSON.stringify(options));
  //request from require('request')
  request(options , function(error, response, body){
      if(error) {
          console.log(error);
      } else {
          console.log(response.statusCode, body);
      }
    });
}

/* Notifications receiver endpoint.
 * now works with recipe id and step id both
 */
app.post("/notifications/:recipeId/:stepId", function (req,res){
  var stepId = req.params.stepId; // getting the parameter from the url
  var recipeId = req.params.recipeId; // getting the parameter from the url

  // just logging the steps
  console.log(recipeId, ':', stepId);
  if(stepId === 'done'){
    // if the parameter is "done" - stop execution
      console.log('done');
  }else {
    execute(recipeId, stepId);
  }
  res.send();// do not forget to response to the simulator on Notifications
});


// ---------------------------------------------------------------------end of 18.04 comments
// starting the server
app.listen(2999, function() {
  console.log('Server started.');
  }
);
