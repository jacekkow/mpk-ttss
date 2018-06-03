<?php
include(__DIR__.'/stops/common.php');
include(__DIR__.'/stops/stops.php');

try {
	// Reject invalid input
	if(!isset($_GET['query'])) throw new UnexpectedValueException();
	if(empty($_GET['query'])) throw new UnexpectedValueException();
	if(strlen($_GET['query']) > 50) throw new UnexpectedValueException();

	// Initialize a DB connection an a query
	$pdo = new PDO('sqlite:stops/stops.db', NULL, NULL, array(
		PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
	));
	$st = $pdo->prepare('SELECT DISTINCT id FROM stop_search WHERE word LIKE ?');

	// Split stop name into words
	$words = split_stop_name($_GET['query']);

	// Find matching stops (their IDs)
	$ids = NULL;
	foreach($words as $word) {
		if(empty($word)) continue;

		// Find stop IDs with names matching the word
		$st->execute(array($word.'%'));
		$results = $st->fetchAll(PDO::FETCH_COLUMN);
		$st->closeCursor();

		if(is_array($ids)) {
			// Merge results with list for previous words
			$ids = array_intersect($ids, $results);
		} else {
			// First search - initialize results list
			$ids = $results;
		}

		// No results will be found
		if(count($ids) == 0) break;
	}

	// Close a DB connection
	unset($st, $pdo);

	// No query was executed - return empty list
	if(!is_array($ids)) throw new UnexpectedValueException();

	// Build a structure for the UI
	$stop_list = [];
	$query_lower = mb_strtolower($_GET['query'], 'UTF-8');
	foreach($ids as $id) {
		$stop_list[] = [
			'id' => $id,
			'name' => $stops[$id],
			'type' => 'stop',
			'relevance' => similar_text(
				$query_lower,
				mb_strtolower($stops[$id], 'UTF-8')
			)
		];
	}

	// Sort stops by relevance
	usort($stop_list, function($a, $b) {
		$rel = $b['relevance'] - $a['relevance'];
		if($rel == 0) return strcasecmp($a['name'], $b['name']);
		return $rel;
	});

	// Return JSON
	echo json_encode($stop_list);
} catch(UnexpectedValueException $e) {
	echo '[]';
} catch(Exception $e) {
	header('HTTP/1.1 503 Service Unavailable');
	echo $e->getMessage();
}
