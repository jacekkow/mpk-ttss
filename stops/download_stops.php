<?php
if(php_sapi_name() !== 'cli') die();

function fetchStops($url) {
	$json = file_get_contents($url);
	$elements = json_decode($json, 1);
	$stops = [];
	foreach($elements['stops'] as $element) {
		if($element['category'] == 'other') continue;
		$stops[$element['shortName']] = $element['name'];
	}
	asort($stops);
	return $stops;
}

function printStops($stops, $prefix) {
	foreach($stops as $id => $stop) {
		echo '  \''.$prefix.str_pad($id."'", 5, ' ', STR_PAD_RIGHT).' => '.var_export($stop, TRUE).','."\n";
	}
}

$stops_tram = fetchStops('http://www.ttss.krakow.pl/internetservice/geoserviceDispatcher/services/stopinfo/stops?left=-648000000&bottom=-324000000&right=648000000&top=324000000');
$stops_bus = fetchStops('http://91.223.13.70/internetservice/geoserviceDispatcher/services/stopinfo/stops?left=-648000000&bottom=-324000000&right=648000000&top=324000000');

echo '<?php'."\n";
echo '$stops = array ('."\n";
printStops($stops_tram, 't');
echo "\n";
printStops($stops_bus, 'b');
echo ');'."\n";
