'use strict';

var CACHE = 'ttss-app-v1';
var CACHE_RESOURCES = [
	'/version.php',
	'/',
	'/common.js',
	'/index.css',
	'/index.html',
	'/index.js',
	'/lang_en.js',
	'/lang_pl.js',
	'/map.css',
	'/map.html',
	'/map.js',
	'/serviceworker-install.js',
	'https://code.jquery.com/jquery-3.1.1.min.js',
	'https://cdn.polyfill.io/v2/polyfill.min.js?features=requestAnimationFrame,Element.prototype.classList',
	'https://openlayers.org/en/v4.1.0/build/ol.js'
];

var self = this;

this.addEventListener('install', event => {
	event.waitUntil(
		caches.open(CACHE).then(cache => {
			return cache.addAll(CACHE_RESOURCES);
		})
	);
});

this.addEventListener('fetch', event => {
	event.respondWith(
		caches.match(event.request).then(response => response || fetch(event.request))
	);
	
	if(event.request.url.endsWith('/version.php')) {
		event.waitUntil(
			Promise.all([
				caches.open(CACHE),
				fetch(event.request)
			]).then(results => {
				var cache = results[0];
				var v2 = results[1];
				var v2copy = v2.clone();
				
				return Promise.all([
					cache.match(event.request).then(v1 => v1.json()),
					v2copy.json()
				]).then(results => {
					var v1json = results[0];
					var v2json = results[1];
					
					return updateCache(cache, v1json, v2json).then(_ => cache.put(event.request, v2)).then(function() {
						console.log('Service Worker: update successful!');
						self.skipWaiting();
						postMessage({action: 'updated'});
					});
				});
			}).catch(function(error) {
				console.log('Service Worker: update failed: ', error);
				postMessage({action: 'updateFailed'});
			})
		);
	}
});

this.addEventListener('activate', event => {
	event.waitUntil(
		caches.keys().then(keyList => Promise.all(
			keyList.map(key => {
				if (key != CACHE) {
					return caches.delete(key);
				}
			})
		)).then(caches.open(CACHE)).then(cache => cache.keys()).then(keys => 
			console.log(keys)
		
			/*Promise.all(
			keys.map(key => {
				console.log(key);
				if(!(key in CACHE_RESOURCES)) {
					//return cache.delete(key);
				}
			})*/
		)
	);
});

function postMessage(message) {
	self.clients.matchAll().then(clients => {
		clients.forEach(client => {
			client.postMessage(message);
		});
	});
}

function updateCache(cache, cachedVersion, currentVersion) {
	var remove = [];
	var add = [];
	
	for(var cachedFile in cachedVersion) {
		if(!currentVersion[cachedFile]) {
			remove.push('/' + cachedFile);
		} else if(cachedVersion[cachedFile] != currentVersion[cachedFile]) {
			add.push('/' + cachedFile);
		}
	}
	for(var currentFile in currentVersion) {
		if(CACHE_RESOURCES.indexOf('/' + currentFile) === -1) {
			continue;
		} else if(!cachedVersion[currentFile]) {
			add.push('/' + currentFile);
		}
	}
	
	console.log('Service Worker: updating files: ', add);
	console.log('Service Worker: deleting files: ', remove);
	
	return cache.addAll(add).then(function() {
		return Promise.all(
			remove.map(filename => {
				return caches.delete(filename)
			})
		);
	});
}

this.addEventListener('message', function(event) {
	switch(event.data.action) {
		case 'skipWaiting':
			self.skipWaiting();
		break;
	}
});
