const { admin, db, auth, storage } = require("./initializeAdmin");

const addEventsToOpportunities = async (events) => {
  try {
    const promises = events.map((event) =>
      db.collection("opportunities").add(event)
    );

    const results = await Promise.all(promises);
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
