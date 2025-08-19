package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"
)

type Track struct {
	Event string `json:"event"`
	Scene string `json:"scene"`
	Ts    int64  `json:"ts"`
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/quote", func(w http.ResponseWriter, r *http.Request) {
		type Resp struct{ Quote string `json:"quote"` }
		q := []string{
			"慢慢来，心会跟上。",
			"今天也要好好休息。",
			"深呼吸，然后重新开始。",
			"去喝一杯水，奖励一下自己。",
		}
		now := time.Now().Unix()
		resp := Resp{Quote: q[now%int64(len(q))]}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	})

	mux.HandleFunc("/api/track", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var t Track
		_ = json.NewDecoder(r.Body).Decode(&t)
		log.Printf("[track] event=%s scene=%s ts=%d", t.Event, t.Scene, t.Ts)
		w.WriteHeader(http.StatusNoContent)
	})

	addr := ":8080"
	fmt.Println("API running at", addr)
	log.Fatal(http.ListenAndServe(addr, withCORS(mux)))
}
