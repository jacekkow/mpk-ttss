# TTSS KRK

This is a rewrite of http://www.ttss.krakow.pl/ website
presenting predicted tram arrival times in Krakow.

Check https://mpk.jacekk.net/ for a live version.

Contact and suggestions: mpk_AT_jacekk.info

[![Codacy Badge](https://api.codacy.com/project/badge/Grade/530c81cbab3449a9b24327591361bec8)](https://app.codacy.com/app/jacekkow/mpk-ttss?utm_source=github.com&utm_medium=referral&utm_content=jacekkow/mpk-ttss&utm_campaign=Badge_Grade_Dashboard)
[![Build Status](https://travis-ci.org/jacekkow/mpk-ttss.svg?branch=master)](https://travis-ci.org/jacekkow/mpk-ttss)

## Differences

* Presents tram delays.
* Lists lines passing through selected stop.
* Improved autocompletion.

## Usage

### Changing language

You can change the interface language using the dropdown near "TTSS Kraków" header.
Currently only Polish (PL) and English (EN) translations are available.

### Selecting the stop

Enter first letter of a stop name into the input field labeled as "Stop name".
Suggestions will be displayed in the dropdown located to the right.

Each name component is matched separately (case-insensitive), so:

- "ba" matches "Teatr Bagatela",
- "d g" matches "Dworzec Główny", "Dworzec Główny Tunel" and "Dworzec Główny Zachód",
- "aleja" matches "M1 Al. Pokoju" and "TAURON Arena Kraków Al. Pokoju",
- "święt" matches "Plac Wszystkich Świętych", "Św.Gertrudy" and "Św.Wawrzyńca".

When the selected suggestion in the dropdown matches the desired stop,
click the "Go" button or (alternatively) press the ENTER key.

### Display

After selecting the stop, the following information are visible:

- Line - line number,
- Direction - final stop on the line,
- Time - predicted/scheduled departure time,
- Delay - calculated delay from the schedule.

Relative times (eg. 3 min) are real-time arrivals based on tram location data.
Absolute times (eg. 8:01) are scheduled departures, shown when the tram cannot be located.

To the left of the time is an icon representing the tram type:
♿ - low-floor tram,
*♿ - partially low-floor tram,
‐ - high-floor tram.
Hover over an icon to show the tooltip with tram identifier and vehicle type.

Rows have different background depending on the tram status:
- green - at the stop,
- white - en-route,
- yellow - delayed 4 or more minutes,
- red - delayed 10 or more minutes.

Clicking on the table row loads the schedule for the selected tram
- listing next stops and predicted departure times for each one.

### Auto-refresh

The list is automatically updated every 20 seconds. It is possible to manually
reload the data using the "Refresh" button.

When an error occurs, automatic update is disabled and manual refresh is required.
This event is indicated by the red message box just over the stop name.

### Bookmarks

Changing the language or selecting a stop causes the address to change.
You may bookmark the address to avoid entering the data each time.

## License

Project is licensed under the BSD 3-Clause license.
Feel free to contribute!
