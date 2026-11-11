import datetime
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

import france_travail
import la_bonne_boite as lbb

S1, S2 = "03925057600012", "56210980100075"


def response(status=200, items=None, **extra):
    items = [] if items is None else items
    return Mock(status_code=status, headers={}, json=Mock(return_value={"hits": len(items), "items": items, **extra}))


def item(siret=S1, score=0, high=False):
    return {"siret": siret, "hiring_potential": score, "is_high_potential": high,
            "company_name": "Information déjà présente dans SIRENE"}


class ClientTests(unittest.TestCase):
    def setUp(self):
        self.token = patch.object(lbb, "_jeton", return_value="jeton-test").start()
        self.session = patch.object(lbb.requests, "Session").start().return_value
        self.sleep = patch.object(lbb.time, "sleep").start()
        self.addCleanup(patch.stopall)

    def test_scope_independant_et_sirets_repetes(self):
        self.session.get.return_value = response(items=[item()])
        client = lbb.Client("client-test", "secret-test")
        self.assertEqual(client.chercher([S1, S2])[0]["siret"], S1)
        self.token.assert_called_once_with("client-test", "secret-test", "search office api_labonneboitev2", "La Bonne Boîte v2")
        self.assertEqual(self.session.get.call_args.kwargs["params"], [("siret", S1), ("siret", S2)])

    def test_lot_trop_grand_est_scinde(self):
        self.session.get.side_effect = [response(422), response(items=[item(S1)]), response(items=[item(S2)])]
        self.assertEqual([i["siret"] for i in lbb.Client("id", "secret").chercher([S1, S2])], [S1, S2])

    def test_quota_reprise_et_renouvellement_jeton(self):
        quota = response(429)
        quota.headers = {"Retry-After": "3"}
        self.session.get.side_effect = [quota, response(401), response(items=[item()])]
        self.assertEqual(len(lbb.Client("id", "secret").chercher([S1])), 1)
        self.sleep.assert_any_call(3.0)
        self.assertEqual(self.token.call_count, 2)

    def test_cadence_sur_les_requetes_successives(self):
        horloge = [0.0]
        instants = []
        self.sleep.side_effect = lambda secondes: horloge.__setitem__(0, horloge[0] + secondes)
        def get(*args, **kwargs):
            instants.append(horloge[0])
            return response()
        self.session.get.side_effect = get
        with patch.object(lbb.time, "monotonic", side_effect=lambda: horloge[0]):
            client = lbb.Client("id", "secret")
            client.chercher([S1]); client.chercher([S2])
        self.assertGreaterEqual(instants[1] - instants[0], .5)

    def test_format_incomplet_ou_siret_inattendu_refuses(self):
        for rep in [response(hits=5), response(items=[item(S2)]), Mock(status_code=200, headers={}, json=lambda: {"error": "indisponible"})]:
            with self.subTest(rep=rep):
                self.session.get.return_value = rep
                with self.assertRaises(RuntimeError):
                    lbb.Client("id", "secret").chercher([S1])

    def test_refus_acces_ne_devient_pas_une_liste_vide(self):
        self.session.get.return_value = response(403)
        with self.assertRaisesRegex(RuntimeError, "abonnement La Bonne Boîte"):
            lbb.Client("id", "secret").chercher([S1])


class CollecteTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dossier = Path(self.tmp.name)
        self.fichier = self.dossier / "la_bonne_boite.json"
        self.env = patch.dict(os.environ, {"FT_CLIENT_ID": "id", "FT_CLIENT_SECRET": "secret"})
        self.env.start(); self.addCleanup(self.env.stop)
        self.client_patch = patch.object(lbb, "Client")
        self.client = self.client_patch.start().return_value
        self.addCleanup(self.client_patch.stop)

    def collecter(self, sirets=(S1, S2), **kwargs):
        return lbb.collecter_bonne_boite(sirets, self.dossier, journal=lambda _: None, **kwargs)

    def test_zero_absence_et_flag_ne_sont_pas_confondus(self):
        self.client.chercher.return_value = [item(S1, 0, True)]
        resultat = self.collecter()
        d = json.loads(self.fichier.read_text(encoding="utf-8"))
        self.assertEqual(resultat["interroges"], 2)
        self.assertEqual(resultat["renseignes"], 1)
        self.assertEqual(resultat["fort_potentiel"], 1)
        self.assertEqual(d["etablissements"], [{"siret": S1, "indice": 0.0, "fort_potentiel": True}])
        self.assertNotIn("secret", self.fichier.read_text())
        self.assertNotIn("company_name", self.fichier.read_text())

    def test_echec_second_lot_conserve_fichier_precedent(self):
        self.fichier.write_text('ancien fichier à conserver', encoding="utf-8")
        self.client.chercher.side_effect = [[item(S1)], RuntimeError("service indisponible")]
        with patch.object(lbb, "LOT", 1), self.assertRaises(RuntimeError):
            self.collecter(forcer=True)
        self.assertEqual(self.fichier.read_text(encoding="utf-8"), 'ancien fichier à conserver')
        self.client.close.assert_called_once()

    def test_cache_et_changement_perimetre(self):
        self.client.chercher.return_value = [item(S1)]
        self.collecter()
        self.client.reset_mock()
        self.collecter()
        self.client.chercher.assert_not_called()
        self.collecter([S1])
        self.client.chercher.assert_called_once_with([S1])

    def test_cache_expire_et_actualisation_forcee(self):
        self.client.chercher.return_value = []
        self.collecter()
        d = json.loads(self.fichier.read_text(encoding="utf-8"))
        d["date"] = (datetime.date.today() - datetime.timedelta(days=7)).isoformat()
        self.fichier.write_text(json.dumps(d), encoding="utf-8")
        self.client.reset_mock()
        self.collecter()
        self.client.chercher.assert_called_once()
        self.client.reset_mock()
        self.collecter(forcer=True)
        self.client.chercher.assert_called_once()

    def test_aucun_identifiant_aucune_requete(self):
        with patch.dict(os.environ, {"FT_CLIENT_SECRET": ""}):
            self.assertIsNone(self.collecter())
        self.client.chercher.assert_not_called()
        self.assertFalse(self.fichier.exists())

    def test_valeurs_hors_contrat_ne_sont_pas_publiees(self):
        for donnees in [item(score=101), item(score=float("nan")), item(score=True), item(high="false")]:
            with self.subTest(donnees=donnees), self.assertRaises(RuntimeError):
                lbb.simplifier(donnees)
        self.assertEqual(lbb.simplifier(item(score=None, high=None))["indice"], None)

    def test_liste_invalide_refusee(self):
        for liste in [[], ["123"], [S1, "[ND]"]]:
            with self.subTest(liste=liste), self.assertRaises(ValueError):
                self.collecter(liste)


class AuthentificationTests(unittest.TestCase):
    def test_scope_lbb_et_url_documentee_sans_changer_scope_offres(self):
        with patch.object(france_travail.requests, "post", return_value=Mock(status_code=200, json=lambda: {"access_token": "jeton-test"})) as post:
            france_travail._jeton("id", "secret", lbb.PORTEE, "La Bonne Boîte v2")
            self.assertTrue(post.call_args.args[0].startswith("https://authentification-partenaire.francetravail.io/"))
            self.assertEqual(post.call_args.kwargs["data"]["scope"], "search office api_labonneboitev2")
            france_travail._jeton("id", "secret")
            self.assertEqual(post.call_args.kwargs["data"]["scope"], "api_offresdemploiv2 o2dsoffre")


if __name__ == "__main__":
    unittest.main()
