#!/usr/bin/env python3
"""Import static CP GTFS into scheduled, never-live, day-scoped JSON."""
import argparse
import csv
import io
import json
import urllib.request
import zipfile
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

DEFAULT_URL = "https://publico.cp.pt/gtfs/gtfs.zip"
LISBON = ZoneInfo("Europe/Lisbon")
WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def rows(archive, name):
    try:
        item = next((n for n in archive.namelist() if n.rsplit("/", 1)[-1].lower() == name), None)
        if not item:
            return []
        with archive.open(item) as handle:
            return list(csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8-sig", newline="")))
    except KeyError:
        return []


def service_ids(date, calendars, exceptions):
    key = date.strftime("%Y%m%d")
    weekday = WEEKDAYS[date.weekday()]
    selected = {
        r["service_id"] for r in calendars
        if r.get("start_date", "") <= key <= r.get("end_date", "")
        and r.get(weekday) == "1"
    }
    for r in exceptions:
        if r.get("date") != key:
            continue
        if r.get("exception_type") == "1":
            selected.add(r["service_id"])
        elif r.get("exception_type") == "2":
            selected.discard(r["service_id"])
    return selected


def type_from_route(route):
    raw = " ".join(str(route.get(k) or "") for k in ("route_short_name", "route_long_name", "route_desc")).upper()
    if "ALFA PENDULAR" in raw or " ALFA " in " " + raw + " ": return "AP"
    if "INTERCIDADES" in raw: return "IC"
    if "INTERREGIONAL" in raw: return "IR"
    if "SUD EXPRESSO" in raw or "SUDEXPRESSO" in raw: return "SUD"
    if "URBANO" in raw or "SUBURBANO" in raw: return "U"
    if "REGIONAL" in raw: return "R"
    short = (route.get("route_short_name") or "").strip().upper()
    return short if short in {"U", "R", "IR", "IC", "AP", "SUD"} else "CP"


def coordinates(stop):
    try:
        lat, lon = float(stop["stop_lat"]), float(stop["stop_lon"])
        return [round(lat, 6), round(lon, 6)] if 35 <= lat <= 43 and -11 <= lon <= -5 else None
    except (ValueError, KeyError, TypeError):
        return None


def time_minutes(t):
    try:
        hour, minute, sec = map(int, (t or "").split(":"))
        if hour < 0 or minute not in range(60) or sec not in range(60): return -1
        return hour * 60 + minute
    except (ValueError, TypeError):
        return -1


def import_feed(source, dest, days, today):
    request = urllib.request.Request(source, headers={"User-Agent": "RJP-Train-Live-2/0.1 (+GTFS)"})
    with urllib.request.urlopen(request, timeout=75) as res:
        raw = res.read(70_000_001)
        if len(raw) > 70_000_000:
            raise ValueError("GTFS exceeds 70 MB compressed")
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        files = ["stops.txt", "routes.txt", "trips.txt", "stop_times.txt"]
        missing = [name for name in files if not any(p.rsplit("/", 1)[-1] == name for p in z.namelist())]
        if missing:
            raise ValueError("GTFS required files missing: " + ", ".join(missing))
        stops = {r["stop_id"]: r for r in rows(z, "stops.txt")}
        routes = {r["route_id"]: r for r in rows(z, "routes.txt")}
        trips = rows(z, "trips.txt")
        calendars = rows(z, "calendar.txt")
        exceptions = rows(z, "calendar_dates.txt")
        by_trip = defaultdict(list)
        for r in rows(z, "stop_times.txt"):
            try: seq = int(r.get("stop_sequence", "0"))
            except ValueError: seq = 0
            by_trip[r.get("trip_id", "")].append((seq, r))
        for values in by_trip.values():
            values.sort(key=lambda s: s[0])

    dest = Path(dest)
    dest.mkdir(parents=True, exist_ok=True)
    now = datetime.now(LISBON).isoformat(timespec="seconds")
    dates = []
    for offset in range(days):
        date = today + timedelta(days=offset)
        active = service_ids(date, calendars, exceptions)
        candidates = []
        relevant_stop_ids = set()
        for trip in trips:
            if trip.get("service_id") not in active:
                continue
            seq = by_trip.get(trip.get("trip_id"), [])
            if len(seq) < 2:
                continue
            route = routes.get(trip.get("route_id"), {})
            sequence = []
            for _, row in seq:
                stop = stops.get(row.get("stop_id"), {})
                sid = row.get("stop_id", "")
                sequence.append({
                    "id": sid,
                    "name": stop.get("stop_name") or sid,
                    "arrival": row.get("arrival_time") or "",
                    "departure": row.get("departure_time") or "",
                    "location": coordinates(stop),
                })
                relevant_stop_ids.add(sid)
            trip_id = trip.get("trip_id", "")
            candidates.append({
                "id": trip_id,
                "number": trip.get("trip_short_name") or route.get("route_short_name") or trip_id,
                "type": type_from_route(route),
                "route": route.get("route_long_name") or route.get("route_short_name") or "",
                "headsign": trip.get("trip_headsign") or "",
                "origin": sequence[0]["name"],
                "destination": sequence[-1]["name"],
                "departure": sequence[0]["departure"],
                "arrival": sequence[-1]["arrival"],
                "stops": sequence,
            })
        candidates.sort(key=lambda t: (time_minutes(t["departure"]), t["number"]))
        station_list = [
            {"id": sid, "name": stops[sid].get("stop_name") or sid, "location": coordinates(stops[sid])}
            for sid in sorted(relevant_stop_ids)
        ]
        payload = {
            "source": "CP GTFS (horários programados)",
            "sourceUrl": source,
            "date": date.isoformat(),
            "generatedAt": now,
            "realtime": False,
            "gps": False,
            "trains": candidates,
            "stations": station_list,
        }
        filename = f"{date.isoformat()}.json"
        (dest / filename).write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"{filename}: {len(candidates)} circulações programadas, {len(station_list)} estações")
        dates.append({"date": date.isoformat(), "file": filename, "trains": len(candidates)})
    (dest / "manifest.json").write_text(json.dumps({
        "source": "CP GTFS (horários programados)",
        "sourceUrl": source,
        "generatedAt": now,
        "realtime": False,
        "gps": False,
        "days": dates,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=DEFAULT_URL)
    parser.add_argument("--dest", default="public/data/cp")
    parser.add_argument("--days", type=int, default=3)
    parser.add_argument("--date", default=None, help="Override start date YYYY-MM-DD for tests")
    args = parser.parse_args()
    if not 1 <= args.days <= 7:
        parser.error("--days must be between 1 and 7")
    day = datetime.fromisoformat(args.date).date() if args.date else datetime.now(LISBON).date()
    import_feed(args.source, args.dest, args.days, day)
