if('serviceWorker' in navigator) {
	window.addEventListener('load', function() {
		navigator.serviceWorker.register('/serviceworker.js').then(function(registration) {
			console.log('Service Worker registration successful. ', registration);
			navigator.serviceWorker.controller.postMessage({action: 'skipWaiting'});
		}).catch(function(err) {
			console.log('Service Worker registration failed. ', err);
		});
	});
}
