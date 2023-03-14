# fs-migrator.js

`fs-migrator` is a Node CLI tool for dealing with schema migrations for Google Cloud Firestore.
It has a similar feel to Sequelize for SQL but applies required schema changes across all documents.

Very helpful if needing to make standardised changes to documents across multiple 
development environments.

## Requirements
You will need to install the google-cloud SDK found [here](https://cloud.google.com/sdk/docs/install-sdk) before using this tool.


## How to install 
```bash
npm install -g fs-migrator
```

## Writing a migration file
```javascript
module.exports = {
  /**
   * This will perform the migration to the database.
   * @param db
   * @param Firestore - Firestore library that contains useful classes like FieldValue, FieldPath & Timestamp
   * @returns {Promise<void>}
   */
  up: async (db, Firestore) => {
    let exampleCollection = await db.collection('example-collection').get()
    let documents = exampleCollection.docs

    // Run all your updates in a transaction
    await db.runTransaction(async (t) => {
      let transactionData = []
      // Extract all the data from the documents
      // All fetch requests must be done before any updates
      for(let doc of documents) {
        let docRef = doc.ref
        const d = await t.get(docRef);
        transactionData.push({id: doc.id, ref: docRef, data: d.data()})
      }
      // Apply updates to each document
      for(let {id, ref, data} of transactionData) {
        // Apply update to each document
        t.update(ref, {testValue: data.testValue + 1})
      }
      return
    });
  },
  /**
   * This will undo the migration applied in the `up` function.
   * @param db
   * @param Firestore - Firestore library that contains useful classes like FieldValue, FieldPath & Timestamp
   * @returns {Promise<void>}
   */
  down: async (db, Firestore) => {
    let exampleCollection = await db.collection('example-collection').get()
    let documents = exampleCollection.docs
    
    // Run all your updates in a transaction
    await db.runTransaction(async (t) => {
      let transactionData = []
      // Extract all the data from the documents
      // All fetch requests must be done before any updates
      for(let doc of documents) {
        let docRef = doc.ref
        const d = await t.get(docRef);
        transactionData.push({id: doc.id, ref: docRef, data: d.data()})
      }
      // Apply updates to each document
      for(let {id, ref, data} of transactionData) {
        // Undo changes
        t.update(ref, {testValue: data.testValue - 1})
      }
      return
    });
  }
}

```
## Usage

### Usage documentation
```bash
fs-migrator --help
```

### Initialising directory for fs-migrator usage
```bash
fs-migrator init
```

### Creating migration file
```bash
fs-migrator create --type migration --name migration_name --collection firestore-collection-name
fs-migrator create -t migration -n migration_name -c firestore-collection-name
```

### Applying migration
```bash
# Standard usage
fs-migrator migrate
# Specifying project and credentials
fs-migrator migrate --project gcp_project_name --credentials /path/to/credentials.json
```

### Rolling back migration 
```bash
fs-migrator migrate --rollback
```

## Features coming soon...

- [x] Provide CLI command for initialising directory
- [x] Provide CLI command for creating migration file directory
- [x] Provide CLI command for applying all migrations
- [x] Provide CLI command for rolling back all migrations
- [x] Create migration file from template
- [ ] Migrate and rollback single files
- [ ] Implement better logging include logging levels such as verbose, debug etc

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

[MIT](https://choosealicense.com/licenses/mit/)
