<?php
$base_proxy = 'http://www.ttss.krakow.pl/internetservice/services';
$method = [
	'/lookup/autocomplete/json' => [
		'query' => function() { return TRUE; },
	],
	'/passageInfo/stopPassages/stop' => [
		'stop' => 'ctype_alnum',
		'mode' => function($mode) { return in_array($mode, ['arrival', 'departure']); },
	],
	'/routeInfo/routeStops' => [
		'routeId' => 'ctype_alnum'
	],
];

$path = $_SERVER['PATH_INFO'];

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
