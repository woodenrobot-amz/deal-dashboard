// This function handles the bookmark toggle logic
function toggleBookmark(asin) {
  let savedDeals = JSON.parse(localStorage.getItem('mySavedDeals')) || [];
  
  if (savedDeals.includes(asin)) {
    savedDeals = savedDeals.filter(id => id !== asin);
  } else {
    savedDeals.push(asin);
  }
  
  localStorage.setItem('mySavedDeals', JSON.stringify(savedDeals));
  
  // Optional: Add a custom event so the UI knows to refresh if needed
  window.dispatchEvent(new Event('storageUpdated'));
}
