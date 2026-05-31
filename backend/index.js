const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const port = process.env.PORT || 5000;
const stripe = require('stripe')(process.env.PAYMENT_SECRET);

//middleware
app.use(cors());
app.use(express.json());

//mongodb connection

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@yoga-master.yilfnw6.mongodb.net/?appName=yoga-master`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    //create a database and collections

    const database = client.db('yoga-master');
    const usersCollections = database.collection('users');
    const classesCollections = database.collection('classes');
    const cartCollections = database.collection('carts');
    const paymentCollections = database.collection('payments');
    const enrolledCollections = database.collection('enrolled');
    const appliedCollections = database.collection('applied');

    //classes routes here
    app.post('/new-class', async (req, res) => {
      const newClass = req.body;
      // newClass.availableSeats = parseInt(newClass.availableSeats);
      const result = await classesCollections.insertOne(newClass);
      res.send(result);
    });

    app.get('/classes', async (req, res) => {
      const result = await classesCollections.find().toArray();
      res.send(result);
    });

    //get classes by instructor email
    app.get('/classes/:email', async (req, res) => {
      const email = req.params.email;
      const query = { instructorEmail: email };
      const result = await classesCollections.find(query).toArray();
      res.send(result);
    });

    // manage classes
    app.get('/classes-manage', async (req, res) => {
      const result = await classesCollections.find().toArray();
      res.send(result);
    });

    //update classes status and reason
    app.patch('/change-status/:id', async (req, res) => {
      const id = req.params.id;
      const status = req.body.status;
      const reason = req.body.reason;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          status: status,
          reason: reason,
        },
      };
      const result = await classesCollections.updateOne(filter, updateDoc, options);
      res.send(result);
    });

    // get approved classes
    app.get('/approved-classes', async (req, res) => {
      const query = { status: 'approved' };
      const result = await classesCollections.find(query).toArray();
      res.send(result);
    });

    //get single class details
    app.get('/class/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classesCollections.findOne(query);
      res.send(result);
    });

    //update class details(all data)
    app.put('/update-class/:id', async (req, res) => {
      const id = req.params.id;
      const updateClass = req.body;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          name: updateClass.name,
          description: updateClass.description,
          price: updateClass.price,
          availableSeats: parseInt(updateClass.availableSeats),
          videoLink: updateClass.videoLink,
          status: updateClass.status,
        },
      };
      const result = await classesCollections.updateOne(filter, updateDoc, options);
      res.send(result);
    });

    //Cart routes ----------------------------------------------------------------------------------------
    app.post('/add-to-cart', async (req, res) => {
      const newCartItem = req.body;
      const result = await cartCollections.insertOne(newCartItem);
      res.send(result);
    });

    //get cart items by id
    app.get('/cart-item/:id', async (req, res) => {
      const id = req.params.id;
      const email = req.body.email;
      const query = {
        classId: id,
        userMail: email,
      };
      const projection = { classId: 1 };
      const result = await cartCollections.findOne(query, {
        projection: projection,
      });
      res.send(result);
    });

    // cart info by email
    app.get('/cart/:email', async (req, res) => {
      const email = req.params.email;
      const query = { userMail: email };
      const projection = { classId: 1 };
      const carts = await cartCollections.findOne(query, {
        projection: projection,
      });
      const classIds = carts.map((cart) => new ObjectId(cart.classId));
      const query2 = { _id: { $in: classIds } };
      const result = await classesCollections.findOne(query2).toArray();
      res.send(result);
    });

    // delete cart item
    app.delete('/delete-cart-item/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollections.deleteOne(query);
      res.send(result);
    });

    app.get('/carts', async (req, res) => {
      const result = await cartCollections.find().toArray();
      res.send(result);
    });

    // PAYMENT ROUTES------------------------------------------------------------------------------------------------------------
    app.post('create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price) * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card'],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // post payment info to db

    app.post('/payment-info', async (req, res) => {
      const paymentInfo = req.body;
      const classesId = paymentInfo.classesId;
      const userEmail = paymentInfo.userEmail;
      const singleClassId = req.query.classId;
      let query;
      if (singleClassId) {
        query = { classId: singleClassId, userMail: userEmail };
      } else {
        query = { classId: { $in: classesId } };
      }

      const classesQuery = {
        _id: { $in: classesId.map((id) => new ObjectId(id)) },
      };
      const classes = await cartCollections.find(classesQuery).toArray();
      const newEnrolledData = {
        userMail: userEmail,
        classId: singleClassId.map((id) => new ObjectId(id)),
        transactionId: paymentInfo.transactionId,
      };
      const updatedDoc = {
        $set: {
          totalEnrolled:
            classes.reduce((total, current) => total + current.totalEnrolled, 0) + 1 || 0,
          availableSeats:
            classes.reduce((total, current) => total + current.availableSeats, 0) - 1 || 0,
        },
      };
      const updatedResult = await classesCollection.updateMany(classesQuery, updateDoc, {
        upsert: true,
      });
      const enrolledResult = await enrolledCollections.insertOne(newEnrolledData);
      const deletedResult = await cartCollections.deleteMany(query);
      const paymentResults = await paymentCollections.insertOne(paymentInfo);

      res.send({
        paymentResults,
        deletedResult,
        enrolledResult,
        updatedResult,
      });
    });

    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 });
    console.log('Pinged your deployment. You successfully connected to MongoDB!');
  } catch (err) {
    console.log(err);
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
