const commandLineCommands = require('command-line-commands')
const commandOptions = [null, 'init', 'migrate', 'create']


const commandLineArgs = require('command-line-args')
const commandLineOptions = [
  {name: 'type', type: String, description: 'The type of object to create using the \'create\' command.', defaultValue: 'migration'},
  {name: 'name', type: String, description: 'The name of the file being created with the \'create\' command.'},
  {name: 'collection', type: String, description: 'The collection name used when creating a new migration.'},
  {name: 'rollback', alias: 'r', type: Boolean, description: 'Used in conjunction with the \'migrate\' command. Performs a migration rollback to undo schema changes.'},
  {name: 'credentials', alias: 'c', type: String, description: 'Optional: Relative path to Google Service account. If not specified, will default to using gcloud CLI or \'GOOGLE_APPLICATION_CREDENTIALS\''},
  {name: 'project', alias: 'p', type: String, defaultOption: [], description: 'Optional: Sets the project where the Firestore database is located.'},
  {name: 'help', alias: 'h', type: Boolean, description: 'Print this usage guide.'},
]
const commandLineUsage = require('command-line-usage')
const commandLineUsageSections = [
  {
    header: 'Firestore Migration Tool',
    content: `A tool used to assist with schema migrations for Firestore collections/documents.
    Provides functionality to create migration files as well as perform and track migrations across multiple projects.`
  },
  {
    header: 'Synopsis',
    content: [
      '$ fs-migrator init',
      '$ fs-migrator create {bold --type} {underline type} {bold --name} {underline migrationName} {bold --collection} {underline collectionName}',
      '$ fs-migrator migrate',
      '$ fs-migrator migrate --rollback',
    ]
  },
  {
    header: 'Options',
    optionList: commandLineOptions
  }
]

require('console-info')
require('console-warn')
require('console-error')
require('console-success')

const fs = require('fs')
const FirestoreDatabase = require('@google-cloud/firestore');

const MIGRATIONS_FOLDER_PATH = 'migrations'
const MIGRATIONS_COLLECTION = 'migrations'

const {GoogleAuth} = require('google-auth-library');

const main = async () => {
  try {
    const {command, argv: commandArgs} = commandLineCommands(commandOptions);
    let options = commandLineArgs(commandLineOptions, {argv:commandArgs})
    if(options.help || command === null) {
      console.log(commandLineUsage(commandLineUsageSections))
      return
    }
    switch(command) {
      case 'init':
        await _performInitialisation()
        break
      case 'migrate':
        let db = await _configureDatabase(options)
        await _performMigrate(db, options)
        break
      case 'create':
        await _performCreate(options)
        break
      default:
        break
    }
  }
  catch(e) {
    console.error(e.message)
    process.exit(1)
  }
}

/**
 * Initialises the
 * @returns {Promise<void>}
 * @private
 */
const _performInitialisation = async () => {
  console.info('Initialising migrator')
  if(!fs.existsSync(`./${MIGRATIONS_FOLDER_PATH}`)) {
    console.info('Creating migrations folder')
    fs.mkdirSync(`./${MIGRATIONS_FOLDER_PATH}`)
  }
  console.success('Successfully initialised migrator')
}

/**
 * Configures a database instance with any options passed in.
 * @param project
 * @param credentials
 * @returns {Promise<*>}
 * @private
 */
const _configureDatabase = async ({project, credentials}) => {
  let dbConfig = {}
  let defaultProject = null
  let authOptions = {}

  if(credentials) {
    dbConfig.keyFilename = credentials
    authOptions.keyFilename = credentials
  } else {console.info('Using default GCP credentials from gcloud CLI or $GOOGLE_APPLICATION_CREDENTIALS')}
  if(project) {dbConfig.project = project} else {
    const auth = new GoogleAuth(authOptions)
    defaultProject = await auth.getProjectId();
  }
  console.info(`Migrating Firestore in project '${project ?? defaultProject}'`)
  const db = new FirestoreDatabase(dbConfig);

  return db
}

const _performCreate = async (options) => {
  switch(options.type) {
    case 'migration':
      await _createMigrationFile(options)
      break
    default:
      await _createMigrationFile(options)
      break
  }
}

/**
 * Creates a migration file from the migrationTemplate and adds in the collectionName.
 * @param createMigration
 * @param collection
 * @returns {Promise<void>}
 */
const _createMigrationFile = async ({name, collection}) => {
  if(!name) {throw new Error('Creating a migration  requires a migration name to passed in via the --name option.')}
  if(!collection) {throw new Error('Creating a migration requires a collection name to passed in via the --collection option.')}

  if(!fs.existsSync(`./${MIGRATIONS_FOLDER_PATH}`)) {
    throw new Error(`No folder found at ./${MIGRATIONS_FOLDER_PATH}. You need to run the migration tool in the same directory as your migrations or run the --init option to initialise the tool.`)
  }

  let template = fs.readFileSync(`${__dirname}/migrationTemplate`).toString()
  template = template.replaceAll('{{collectionName}}', collection.trim())
  let migrationNameRegex = /\b[a-zA-Z0-9]+(\_[a-zA-Z0-9]+)*\b/g
  const isValidName = migrationNameRegex.test(name)
  if(!isValidName) throw new Error(`--createMigration parameter must match ${migrationNameRegex}`)

  let currentTimestamp = Math.floor(Date.now() / 1000)
  let migrationFilename = `${currentTimestamp}_${name}.js`
  fs.writeFileSync(`./${MIGRATIONS_FOLDER_PATH}/${migrationFilename}`, template)
  console.success(`Successfully created migration '${migrationFilename}' for ${collection} collection`)
}

/**
 * Performs migration up or down based on the rollback option.
 * @param db
 * @param options
 * @returns {Promise<void>}
 */
const _performMigrate = async (db, options) => {
  if(!options.rollback) {
    await _performMigrateUp(db, options)
  } else {
    await _performMigrateDown(db, options)
  }
}

/**
 * Handles migration by checking the migrations collection for already executed migrations and only runs new ones
 * in ascending chronological order.
 * @param db
 * @param options
 * @returns {Promise<void>}
 * @private
 */
const _performMigrateUp = async (db, options) => {
  let migrationsCollection = await db.collection(MIGRATIONS_COLLECTION).orderBy('createDate', 'asc').get()
  let performedMigrations = migrationsCollection.docs.map((doc) => `${doc.id}.js`)
  let migrationFilenames = fs.readdirSync(`./${MIGRATIONS_FOLDER_PATH}`)
  migrationFilenames = migrationFilenames.filter((f) => !performedMigrations.includes(f))
  for(let migrationFilename of migrationFilenames) {
    console.info(`Performing 'up' migration of '${migrationFilename}`)
    let startTime = new Date()
    const {up} = require(`${process.cwd()}/${MIGRATIONS_FOLDER_PATH}/${migrationFilename}`)
    await up(db, FirestoreDatabase)
    console.success(`Completed 'up' migration of '${migrationFilename}`)
    let endTime = new Date()
    let [createTimestamp] = migrationFilename.split('_')

    let documentData = {
      migrationFilename: migrationFilename,
      createDate: new Date(parseInt(createTimestamp) * 1000),
      startTime,
      endTime
    }
    console.info(`Writing migration data to '${MIGRATIONS_COLLECTION}/${migrationFilename}`)
    let [migrationName] = migrationFilename.split('.')
    let migrationDocument = db.collection(MIGRATIONS_COLLECTION).doc(migrationName)
    await migrationDocument.set(documentData)
    console.success(`Successfully wrote migration data to '${MIGRATIONS_COLLECTION}/${migrationFilename}`)
  }
  if(migrationFilenames.length > 0) {
    console.success(`Successfully completed Firestore migration`)
  } else {
    console.success(`All migrations have been completed already`)
  }

}

/**
 * Handles undoing all migrations applied to
 * @param db
 * @param options
 * @returns {Promise<void>}
 * @private
 */
const _performMigrateDown = async (db, options) => {
  let migrationsCollection = await db.collection(MIGRATIONS_COLLECTION).orderBy('createDate', 'desc').get()
  let performedMigrations = migrationsCollection.docs.map((doc) => `${doc.id}.js`)
  let migrationFilenames = fs.readdirSync(`./${MIGRATIONS_FOLDER_PATH}`)
  migrationFilenames = migrationFilenames.filter((f) => performedMigrations.includes(f))
  for(let migrationFilename of migrationFilenames) {
    console.info(`Performing 'down' migration of '${migrationFilename}`)
    const {down} = require(`${process.cwd()}/${MIGRATIONS_FOLDER_PATH}/${migrationFilename}`)
    await down(db, FirestoreDatabase)
    console.success(`Completed 'down' migration of '${migrationFilename}`)
    console.info(`Deleting migration data from '${MIGRATIONS_COLLECTION}/${migrationFilename}`)
    let [migrationName] = migrationFilename.split('.')
    let migrationDocument = db.collection(MIGRATIONS_COLLECTION).doc(migrationName)
    await migrationDocument.delete()
    console.success(`Successfully wrote migration data to '${MIGRATIONS_COLLECTION}/${migrationFilename}`)
  }
  if(migrationFilenames.length > 0) {
    console.success(`Successfully completed Firestore rollback`)
  } else {
    console.success(`There are no migrations to rollback`)
  }

}

module.exports = {main}
