casper.test.begin('Stop name autocompletion', 4, function(test) {
	casper.start('http://127.0.0.1:8080/', function() {
		test.assertTitleMatches(/^TTSS\s/, 'Page title: TTSS...');
	});
	
	var autocomplete_pairs = [
		['bag', 'Teatr Bagatela'],
		['d g', 'Dworzec Główny'],
		['świę', 'Plac Wszystkich Świętych'],
	];
	
	autocomplete_pairs.forEach(function(value) {
		casper.then(function() {
			this.sendKeys('#stop-name', value[0], {reset: true});
		}).wait(200, function() {
			test.assertSelectorHasText(
				'#stop-name-autocomplete > option',
				value[1],
				'Autocomplete: ' + value[1]
			);
		});
	});
	
	casper.run(function() {
		test.done();
	});
});

casper.test.begin('Translation engine', 2, function(test) {
	casper.start('http://127.0.0.1:8080/#!pl', function() {
		test.assertTitleMatches(/odjazdy/i, 'Page title: ...odjazdy...');
	});
	
	casper.wait(200, function() {
		test.assertSelectorHasText(
			'[data-translate=header_lines]',
			'Linie',
			'Translation: Lines -> Linie'
		);
	});
	
	casper.run(function() {
		test.done();
	});
});
