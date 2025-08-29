/** @format */

// provide Firebase admin SDK and Firestore database access
// This file initializes Firebase and exports the necessary instances and functions
// Note: we need Firebase Admin SDK for server-side operations (like writing events/postings
// directly to opportunities database)

// import the Firebase admin SDK from itializeAdmin.js
const {admin, db, auth, storage} = require('./initializeAdmin')

// adds events to the opportunities collection for a specific club
// Note: This function now expects pre-filtered events (duplicates should be filtered out before calling)
const addEventsToOpportunities = async (clubId, events) => {
	//clubId, events array
	try {
		const timestamp = admin.firestore.FieldValue.serverTimestamp() // Get server timestamp for last_checked so we can track when the events were last added
		const updateClubPromise = db.collection('clubs').doc(clubId).set(
			{
				last_checked: timestamp,
			},
			{merge: true}
		)
		const promises = events.map(
			(event) => db.collection(`clubs/${clubId}/opportunities`).add(event) // Add each event to the club's opportunities sub-collection
		)

		const results = await Promise.all([updateClubPromise, ...promises]) // Wait for all promises to resolve (all events added and club updated)
		return results
	} catch (error) {
		console.error('Error adding events to opportunities:', error)
		throw error
	}
}

const getClubs = async () => {
	// Fetch all clubs from the Firestore database
	try {
		const snapshot = await db.collection('clubs').get() // Get all documents in the clubs collection
		const clubs = []
		snapshot.forEach((doc) => {
			clubs.push({id: doc.id, ...doc.data()}) // Push each club document into the clubs array with its ID
		})
		return clubs
	} catch (error) {
		console.error('Error getting clubs:', error)
		throw error
	}
}

const getClubById = async (clubId) => {
	// Fetch a specific club object by its ID from the Firestore database
	try {
		const doc = await db.collection('clubs').doc(clubId).get()
		if (!doc.exists) {
			return null
		}
		return {id: doc.id, ...doc.data()}
	} catch (error) {
		console.error('Error getting club by ID:', error)
		throw error
	}
}

// Get all existing event titles for a club (case-insensitive)
const getExistingEventTitles = async (clubId) => {
	try {
		const snapshot = await db.collection(`clubs/${clubId}/opportunities`).get()
		const titles = []
		snapshot.forEach((doc) => {
			const data = doc.data()
			if (data && data.title) {
				titles.push(data.title.toLowerCase())
			}
		})
		return titles
	} catch (error) {
		console.error('Error getting existing event titles:', error)
		return []
	}
}

// Optionally: Delete an event by title for a club
const deleteEventByTitle = async (clubId, title) => {
	try {
		const snapshot = await db
			.collection(`clubs/${clubId}/opportunities`)
			.where('title', '==', title)
			.get()
		const batch = db.batch()
		snapshot.forEach((doc) => {
			batch.delete(doc.ref)
		})
		await batch.commit()
		return true
	} catch (error) {
		console.error('Error deleting event by title:', error)
		return false
	}
}

// Delete all documents in a subcollection (opportunities) for a club
const deleteAllOpportunitiesForClub = async (clubId) => {
	const batchSize = 500
	const collectionRef = db.collection(`clubs/${clubId}/opportunities`)
	let deleted = 0
	while (true) {
		const snapshot = await collectionRef.limit(batchSize).get()
		if (snapshot.empty) break
		const batch = db.batch()
		snapshot.docs.forEach((doc) => batch.delete(doc.ref))
		await batch.commit()
		deleted += snapshot.size
		if (snapshot.size < batchSize) break
	}
	return deleted
}

// Delete all opportunities subcollections for all clubs
const deleteAllOpportunitiesForAllClubs = async () => {
	const clubs = await getClubs()
	let totalDeleted = 0
	for (const club of clubs) {
		const deleted = await deleteAllOpportunitiesForClub(club.id)
		console.log(`Deleted ${deleted} opportunities for club ${club.id}`)
		totalDeleted += deleted
	}
	return totalDeleted
}

// Export Firebase instances for use throughout the app
module.exports = {
	admin,
	db,
	auth,
	storage,
	addEventsToOpportunities,
	getClubs,
	getClubById,
	getExistingEventTitles,
	deleteEventByTitle,
	deleteAllOpportunitiesForClub,
	deleteAllOpportunitiesForAllClubs,
}
