import Firebase from '../../api/firebase/config';
import axios from 'axios';

// EXTERNAL
import { getDistance } from 'geolib';
import firebase from 'firebase'
const geofirestore = require('geofirestore');
const GeoFirestore = geofirestore.initializeApp(Firebase.firestore());
const fs = Firebase.firestore()
const db = Firebase.database()

// TYPES
export const FETCH_CRIMES = 'FETCH_CRIMES';
export const FETCH_MY_REPORTS = 'FETCH_MY_REPORTS';

// MODELS
import Crime from '../../models/crime';


export const fetchCrimes = (latitude, longitude, radius, screen) => {
    return async(dispatch, getState) => {
        let crimes = []
            //const radius = 0.25
        const KMRadius = radius * 1.609;
        const spotCrimeRadius = radius === 0.5 ? '0.007' : '0.0035'
        let APIKEY;

        // get current key for spotcrime
        await db.ref('APIKEY').once('value').then(function(snapshot) {
            APIKEY = snapshot.val()
        }).catch((err) => console.log(err));


        const query = GeoFirestore.collection('userReports')
            .near({ center: new firebase.firestore.GeoPoint(latitude, longitude), radius: KMRadius })
            .where('active', '==', true)

        const userCrimeData = query.get()
            .then((querySnapshot) => {
                querySnapshot.forEach(function(doc) {

                    crimes.push(new Crime(
                        doc.id,
                        doc.data().type,
                        doc.data().coordinates.latitude,
                        doc.data().coordinates.longitude,
                        doc.data().description,
                        doc.data().reportedAt.toDate(),
                        doc.data().address,
                        doc.data().authorName,
                        doc.data().authorId,
                    ))
                })
            })
            .catch(function(error) {
                console.log("Error user reports: ", error);
            });


        const policeCrimeData = axios({
                url: `https://spotcrime.com/crimes.json?lat=${latitude}&lon=${longitude}&radius=${spotCrimeRadius}`,
                method: 'get',
                headers: {
                    'Content-Type': 'application/json',
                    'authorization': APIKEY
                }
            })
            .then((result) => {
                result.data.crimes.forEach(function(doc) {
                    if (doc.type === 'Other') {
                        //return
                    }

                    crimes.push(new Crime(
                        doc.cdid.toString(),
                        doc.type,
                        doc.lat,
                        doc.lon,
                        doc.description,
                        Date.parse(doc.date),
                        doc.address,
                        doc.authorName,
                        doc.authorId,
                    ))
                })
            })
            .catch((err) => console.log('Error getting police reports: ' + err))


        await Promise.all([policeCrimeData, userCrimeData]).then(() => {

            // GET RID OF MULTIPLE INSTANCES OF A CRIME REPORT AND ONLY RETURN MOST RECENT
            for (const crime of crimes) {
                const d = new Date(crime.reportedAt)
                const timeLow = d.setHours(d.getHours() - 2)
                const timeHigh = d.setHours(d.getHours() + 2)

                const similarCrimes = crimes.filter(crime2 => {

                    crime2.reportedAt = new Date(crime2.reportedAt)
                    return (
                        // type is the same
                        crime.type === crime2.type &&

                        // occured within 4 hours of the crime
                        crime2.reportedAt >= timeLow &&
                        crime2.reportedAt <= timeHigh &&

                        // within 100m of the crime
                        getDistance({ lat: crime.lat, lng: crime.lon }, { lat: crime2.lat, lng: crime2.lon }) < 100
                    )
                })

                let mostRecent = null;

                // checks if any similar crimes contain one that was posted by current user
                const currentUserPosts = similarCrimes.filter(crime => crime.authorId === getState().user.uid)

                if (currentUserPosts.length > 0) {
                    // remove all other similar crimes and only return ones that the user posted
                    crimes = crimes.filter(crime => !similarCrimes.includes(crime) || currentUserPosts.includes(crime))
                    continue;
                }

                for (const crime of similarCrimes) {
                    // returns the most recent crime of all the similar crimes
                    if (!mostRecent || crime.reportedAt > mostRecent.reportedAt) {
                        mostRecent = crime
                    }
                }

                crimes = crimes.filter(crime => !similarCrimes.includes(crime) || crime === mostRecent)

            }

            // DISPLAY APPROPRIATE DATA FOR QUANTITY OF CRIMES
            let timeRange;

            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            const thisWeek = crimes.filter(crime => new Date(crime.reportedAt) >= weekAgo)

            const monthAgo = new Date();
            monthAgo.setDate(monthAgo.getDate() - 30);
            const thisMonth = crimes.filter(crime => new Date(crime.reportedAt) >= monthAgo)


            if (screen === 'homescreen') {
                if (thisWeek.length >= 2) {
                    crimes = thisWeek
                    timeRange = 'past week'
                } else if (thisMonth.length >= 2) {
                    crimes = thisMonth
                    timeRange = 'past month'
                } else {
                    crimes = crimes;
                    timeRange = 'past year'
                }
            }

            dispatch({ type: FETCH_CRIMES, crimes: crimes, screen: screen, timeRange: timeRange })
        });
    }
}

export const fetchMyReports = () => {
    return async(dispatch, getState) => {
        const reports = []
        const query = fs.collection("userReports").where("authorId", "==", getState().user.uid)

        await query.get()
            .then((querySnapshot) => {
                querySnapshot.forEach((doc) => {
                    reports.push(new Crime(
                        doc.id,
                        doc.data().type,
                        doc.data().coordinates.latitude,
                        doc.data().coordinates.longitude,
                        doc.data().description,
                        doc.data().reportedAt.toDate(),
                        doc.data().address,
                        doc.data().authorName,
                        doc.data().authorId,
                        doc.data().authorProfileImg,
                    ))
                })
                dispatch({ type: FETCH_MY_REPORTS, reports: reports })
            })
            .catch(function(error) {
                console.log("Error getting documents: ", error);
            });
    }
}