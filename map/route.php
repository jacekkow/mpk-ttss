<?php
header('Content-type: application/json; charset=utf-8');

$origin = urldecode($_GET["origin"]);
$destination = urldecode($_GET["destination"]);

echo file_get_contents("https://maps.googleapis.com/maps/api/directions/json?origin=$origin&destination=$destination");
