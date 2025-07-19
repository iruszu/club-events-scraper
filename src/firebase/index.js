const { admin, db, auth, storage } = require("./initializeAdmin");

const addEventsToOpportunities = async (clubId, events) => {
  try {
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const updateClubPromise = db.collection("clubs").doc(clubId).set(
      {
        "last_checked": timestamp,
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

// Export Firebase instances for use throughout the app
module.exports = {
  admin,
  db,
  auth,
  storage,
  addEventsToOpportunities,
};
