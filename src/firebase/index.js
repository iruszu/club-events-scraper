const { admin, db, auth, storage } = require("./initializeAdmin");

const addEventsToOpportunities = async (clubId, events) => {
  try {
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const updateClubPromise = db.collection("clubs").doc(clubId).set(
      {
        last_checked: timestamp,
      },
      { merge: true }
    );
    const promises = events.map((event) =>
      db.collection(`clubs/${clubId}/opportunities`).add(event)
    );

    const results = await Promise.all([updateClubPromise, ...promises]);
    return results;
  } catch (error) {
    console.error("Error adding events to opportunities:", error);
    throw error;
  }
};

const getClubs = async () => {
  try {
    const snapshot = await db.collection("clubs").get();
    const clubs = [];
    snapshot.forEach((doc) => {
      clubs.push({ id: doc.id, ...doc.data() });
    });
    return clubs;
  } catch (error) {
    console.error("Error getting clubs:", error);
    throw error;
  }
};

const getClubById = async (clubId) => {
  try {
    const doc = await db.collection("clubs").doc(clubId).get();
    if (!doc.exists) {
      return null;
    }
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error("Error getting club by ID:", error);
    throw error;
  }
};

// Export Firebase instances for use throughout the app
module.exports = {
  admin,
  db,
  auth,
  storage,
  addEventsToOpportunities,
  getClubs,
  getClubById,
};
