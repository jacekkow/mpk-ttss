module.exports = {
	'Stop name autocompletion': function(browser) {
		browser.url('http://127.0.0.1:8080/');
		browser.getTitle(function(title) {
			this.assert.ok(title.includes('TTSS'));
		});

		var autocomplete_pairs = [
			['baga', 'Teatr Bagatela'],
			['d g', 'Dworzec Główny'],
			['świę', 'Plac Wszystkich Świętych'],
			['św g', 'Św. Gertrudy'],
			['św.g', 'Św. Gertrudy'],
		];
		autocomplete_pairs.forEach(function(value) {
			browser.clearValue('#stop-name');
			browser.setValue('#stop-name', value[0]);
			browser.pause(200);
			browser.expect.element('#stop-name-autocomplete > option:first-child').to.be.present.before(1000);
			browser.expect.element('#stop-name-autocomplete > option:first-child').text.to.include(value[1]).before(1000);
		});
	},
	'Translation engine': function(browser) {
		browser.url('http://127.0.0.1:8080/#!en');
		browser.pause(200);
		browser.getTitle(function(title) {
			this.assert.ok(title.includes('departures'));
		});
		browser.expect.element('[data-translate=header_line]').text.to.include('Line');
	},
};
