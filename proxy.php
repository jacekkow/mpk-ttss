<?php
$base_proxy = 'http://www.ttss.krakow.pl/internetservice';
$method = [
	'/services/lookup/autocomplete/json' => [
		'query' => function() { return TRUE; },
	],
	'/services/passageInfo/stopPassages/stop' => [
		'stop' => 'ctype_alnum',
		'mode' => function($mode) { return in_array($mode, ['arrival', 'departure']); },
	],
	'/services/tripInfo/tripPassages' => [
		'tripId' => 'ctype_digit',
		'mode' => function($mode) { return in_array($mode, ['arrival', 'departure']); },
		#'vehicleId' => 'ctype_digit',
	],
	'/services/routeInfo/routeStops' => [
		'routeId' => 'ctype_alnum'
	],
];
$rewrite = [
	'/lookup/autocomplete/json' => '/services/lookup/autocomplete/json',
	'/passageInfo/stopPassages/stop' => '/services/passageInfo/stopPassages/stop',
	'/routeInfo/routeStops' => '/services/routeInfo/routeStops',
];

$path = $_SERVER['PATH_INFO'];

if(isset($rewrite[$path])) {
	$path = $rewrite[$path];
}

if(!isset($method[$path])) {
	header('HTTP/1.1 403 Forbidden');
	die('Forbidden');
}

$parameters = [];

foreach($method[$path] as $name => $filter) {
	if(!isset($_GET[$name])) {
		header('HTTP/1.1 403 Forbidden');
		die('Parameter '.$name.' is required');
	}
	
	if(!$filter($_GET[$name])) {
		header('HTTP/1.1 403 Forbidden');
		die('Parameter '.$name.' has invalid value');
	}
	
	$parameters[$name] = $_GET[$name];
}

$result = @file_get_contents($base_proxy . $path . '?' . http_build_query($parameters));
if(!$result OR $http_response_header[0] != 'HTTP/1.1 200 OK') {
	header('HTTP/1.1 503 Service Unavailable');
	if(isset($http_response_header[0])) {
		die($http_response_header[0]);
	} else {
		die('Unknown error');
	}
}

header('Content-Type: application/json');
echo $result;
