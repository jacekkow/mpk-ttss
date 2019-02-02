<?php
if(php_sapi_name() !== 'cli') die();

include('stops.php');
include('common.php');

$pdo = new PDO('sqlite:stops_temp.db');

$pdo->query('DROP TABLE IF EXISTS stop_search');
$pdo->query('CREATE TABLE stop_search (
	word VARCHAR(60),
	id VARCHAR(255)
)');

function processStops($st, $stops) {
	foreach($stops as $id => $name) {
		foreach(split_stop_name($name) as $word) {
			$st->execute([$word, $id]);
			$st->closeCursor();
		}
	}
}

$pdo->beginTransaction();
$st = $pdo->prepare('INSERT INTO stop_search (word, id) VALUES (?, ?)');
processStops($st, $stops);
$pdo->commit();

$pdo->query('CREATE INDEX stop_search_word ON stop_search (word COLLATE NOCASE)');

rename('stops_temp.db', 'stops.db');
