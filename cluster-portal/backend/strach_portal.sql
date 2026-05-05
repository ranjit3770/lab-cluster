/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19  Distrib 10.6.22-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: localhost    Database: strach_portal
-- ------------------------------------------------------
-- Server version	10.6.22-MariaDB-0ubuntu0.22.04.1

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `cluster_health`
--

DROP TABLE IF EXISTS `cluster_health`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `cluster_health` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `slurmctld_status` varchar(50) DEFAULT NULL,
  `slurmdbd_status` varchar(50) DEFAULT NULL,
  `cluster_status` varchar(50) DEFAULT NULL,
  `last_heartbeat` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_cluster_health_id` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cluster_health`
--

LOCK TABLES `cluster_health` WRITE;
/*!40000 ALTER TABLE `cluster_health` DISABLE KEYS */;
/*!40000 ALTER TABLE `cluster_health` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `dev_nodes`
--

DROP TABLE IF EXISTS `dev_nodes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `dev_nodes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `ip_address` varchar(50) NOT NULL,
  `ssh_port` int(11) DEFAULT NULL,
  `ssh_username` varchar(255) NOT NULL,
  `ssh_password` varchar(255) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ix_dev_nodes_name` (`name`),
  KEY `ix_dev_nodes_id` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `dev_nodes`
--

LOCK TABLES `dev_nodes` WRITE;
/*!40000 ALTER TABLE `dev_nodes` DISABLE KEYS */;
INSERT INTO `dev_nodes` VALUES (1,'Head Node','192.168.196.250',22,'root','hn','2026-01-08 15:10:01'),(2,'Worker Node 1','192.168.196.90',22,'root','Nu4AtirmA','2026-01-08 15:10:59'),(3,'Worker Node 2','192.168.196.91',22,'root','Nu4AtirmA','2026-01-08 15:37:17'),(9,'Worker Node 3','192.168.196.92',22,'root','Nu4AtirmA','2026-01-08 16:44:52');
/*!40000 ALTER TABLE `dev_nodes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `jobs`
--

DROP TABLE IF EXISTS `jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `jobs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `job_name` varchar(255) NOT NULL,
  `script_path` varchar(500) DEFAULT NULL,
  `status` enum('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED') DEFAULT NULL,
  `output_log` text DEFAULT NULL,
  `error_log` text DEFAULT NULL,
  `owner_id` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `requirements_path` varchar(500) DEFAULT NULL,
  `dependency_path` varchar(500) DEFAULT NULL,
  `slurm_job_id` varchar(50) DEFAULT NULL,
  `total_cpu` int(11) DEFAULT 1,
  `total_ram` int(11) DEFAULT 1,
  `resource_mode` varchar(20) DEFAULT 'node_wise',
  `walltime` varchar(20) DEFAULT '00:10:00',
  PRIMARY KEY (`id`),
  KEY `owner_id` (`owner_id`),
  KEY `ix_jobs_job_name` (`job_name`),
  KEY `ix_jobs_id` (`id`),
  CONSTRAINT `jobs_ibfk_1` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=97 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `jobs`
--

LOCK TABLES `jobs` WRITE;
/*!40000 ALTER TABLE `jobs` DISABLE KEYS */;
INSERT INTO `jobs` VALUES (56,'test3','main.py','COMPLETED','Job dispatched successfully. ID: 52',NULL,9,'2026-01-08 10:31:14','2026-01-08 10:35:09','','','52',1,1,'node_wise','00:10:00'),(57,'test2','test/demo_test.py','FAILED',NULL,'External API Error (500): Internal Server Error',9,'2026-01-08 10:47:47','2026-01-08 10:47:47','','',NULL,1,1,'node_wise','00:10:00'),(60,'test2','main.py','COMPLETED','Job dispatched successfully. ID: 53',NULL,9,'2026-01-08 10:55:24','2026-01-08 11:01:31','','','53',1,1,'node_wise','00:10:00'),(61,'test1','main1.py','COMPLETED','Job dispatched successfully. ID: 54',NULL,9,'2026-01-08 11:05:09','2026-01-08 11:06:01','','','54',1,1,'node_wise','00:10:00'),(62,'test1','main1.py','COMPLETED','Job dispatched successfully. ID: 55',NULL,9,'2026-01-08 11:06:09','2026-01-08 11:06:52','','','55',1,1,'node_wise','00:10:00'),(63,'test321','test/demo_test.py','FAILED',NULL,'External API Error (500): Internal Server Error',9,'2026-01-08 11:07:09','2026-01-08 11:07:09','','',NULL,1,1,'node_wise','00:10:00'),(64,'test123','test/demo_test.py','COMPLETED','Job dispatched successfully. ID: 56',NULL,9,'2026-01-08 11:15:59','2026-01-08 11:22:30','','','56',1,1,'node_wise','00:10:00'),(65,'demo','test/demo_test.py','COMPLETED','Job dispatched successfully. ID: 57',NULL,9,'2026-01-08 11:22:51','2026-01-08 11:23:09','','','57',1,1,'node_wise','00:10:00'),(66,'dmoe','demo_folder/demo1.py','COMPLETED','Job dispatched successfully. ID: 58',NULL,9,'2026-01-08 11:24:38','2026-01-08 11:30:23','','','58',1,1,'node_wise','00:10:00'),(67,'demo123','demo_folder/demo1.py','COMPLETED','Job dispatched successfully. ID: 59',NULL,9,'2026-01-08 11:30:38','2026-01-08 11:33:51','','','59',1,1,'node_wise','00:10:00'),(68,'dmeo1234','demo_folder/demo1.py','COMPLETED','Job dispatched successfully. ID: 60',NULL,9,'2026-01-08 11:33:59','2026-01-08 11:36:43','','','60',1,1,'node_wise','00:10:00'),(69,'sefsf','demo_folder/demo1.py','COMPLETED','Job dispatched successfully. ID: 61',NULL,9,'2026-01-08 11:36:48','2026-01-08 11:41:23','','','61',1,1,'node_wise','00:10:00'),(70,'demotest','demo_folder/demo1.py','COMPLETED','Job dispatched successfully. ID: 62',NULL,9,'2026-01-08 11:41:30','2026-01-08 11:41:58','','','62',1,1,'node_wise','00:10:00'),(71,'demo21e12','demo_folder/demo1.py','COMPLETED','Job dispatched successfully. ID: 63',NULL,9,'2026-01-08 11:42:20','2026-01-08 11:48:51','','','63',1,1,'node_wise','00:10:00'),(72,'dmeo child','demo_folder/demo1.py','COMPLETED','Job dispatched successfully. ID: 64',NULL,9,'2026-01-08 11:49:02','2026-01-08 11:50:19','','','64',1,1,'node_wise','00:10:00'),(73,'dmeo child','demo_folder/demo1.py','COMPLETED','Job dispatched successfully. ID: 65',NULL,9,'2026-01-08 11:50:24','2026-01-08 12:02:05','','','65',1,1,'node_wise','00:10:00'),(74,'dmeo child','demo_folder/demo1.py','COMPLETED','Job dispatched successfully. ID: 66',NULL,9,'2026-01-08 12:02:13','2026-01-08 12:02:26','','','66',1,1,'node_wise','00:10:00'),(75,'dmeo child','demo_folder/demo1.py','COMPLETED','Job dispatched successfully. ID: 67',NULL,9,'2026-01-08 12:03:26','2026-01-08 12:04:08','','','67',1,1,'node_wise','00:10:00'),(76,'dmeo child','demo_folder/demo1.py','COMPLETED','Job dispatched successfully. ID: 68',NULL,9,'2026-01-08 12:04:14','2026-01-08 12:09:02','','','68',1,1,'node_wise','00:10:00'),(77,'dmeo child','demo_folder/demo1.py','COMPLETED','Job dispatched successfully. ID: 69',NULL,9,'2026-01-08 12:09:07','2026-01-08 12:10:59','','','69',1,1,'node_wise','00:10:00'),(79,'dmeo child','demo_folder/demo1.py','COMPLETED','Job dispatched successfully. ID: 71',NULL,9,'2026-01-08 12:20:20','2026-01-08 12:25:13','','','71',1,1,'node_wise','00:10:00'),(80,'dmeo child','demo_folder/demo1.py','COMPLETED','Job dispatched successfully. ID: 72',NULL,9,'2026-01-08 12:25:20','2026-01-08 12:27:02','','','72',1,1,'node_wise','00:10:00'),(81,'dmeo123','demo_folder/demo1.py','COMPLETED','Job dispatched successfully. ID: 73',NULL,9,'2026-01-08 12:28:12','2026-01-08 12:35:44','requirements.txt','','73',1,1,'node_wise','00:10:00'),(82,'demotest','demo_folder/demo1.py','COMPLETED','Job dispatched successfully. ID: 74',NULL,9,'2026-01-08 12:35:51','2026-01-08 12:35:57','','','74',1,1,'node_wise','00:10:00'),(83,'demote123','demo_folder/demo1.py','COMPLETED','Job dispatched successfully. ID: 75',NULL,9,'2026-01-08 12:36:10','2026-01-08 12:37:52','requirements.txt','','75',1,1,'node_wise','00:10:00'),(84,'demotest','demo_folder/demo1.py','COMPLETED','Job dispatched successfully. ID: 76',NULL,9,'2026-01-08 12:37:58','2026-01-08 12:38:11','','','76',1,1,'node_wise','00:10:00'),(85,'asdas','demo_folder/demo1.py','COMPLETED','Job dispatched successfully. ID: 77',NULL,9,'2026-01-08 12:38:35','2026-01-08 12:43:09','','','77',1,1,'node_wise','00:10:00'),(87,'asdasdas','demo_folder/demo1.py','COMPLETED','Job dispatched successfully. ID: 79',NULL,9,'2026-01-08 12:45:05','2026-01-08 12:47:40','','','79',1,1,'node_wise','00:10:00'),(88,'asdasdas13123221','demo_folder/demo1.py','COMPLETED','Job dispatched successfully. ID: 80',NULL,9,'2026-01-08 12:47:50','2026-01-08 12:49:55','','','80',1,1,'node_wise','00:10:00'),(89,'asdasdas','demo_folder/demo1.py','COMPLETED','Job dispatched successfully. ID: 81',NULL,9,'2026-01-08 12:49:55','2026-01-08 13:25:01','','','81',1,1,'node_wise','00:10:00'),(90,'vsdsd','demo_folder/demo1.py','COMPLETED','Job dispatched successfully. ID: 82',NULL,9,'2026-01-08 13:25:28','2026-01-08 13:25:40','','','82',1,1,'node_wise','00:10:00'),(91,'demo','demo_folder/demo1.py','COMPLETED','Job dispatched successfully. ID: 83',NULL,9,'2026-01-08 13:26:21','2026-01-08 13:28:46','','','83',1,1,'node_wise','00:10:00'),(92,'sdasda','demo_folder/demo1.py','COMPLETED','Job dispatched successfully. ID: 84',NULL,9,'2026-01-08 13:28:52','2026-01-08 13:39:06','','','84',1,1,'node_wise','00:10:00'),(93,'testsdad','demo_folder/demo1.py','COMPLETED','Job dispatched successfully. ID: 85',NULL,9,'2026-01-08 13:39:26','2026-01-08 13:39:39','','','85',1,1,'node_wise','00:10:00'),(94,'tesrvsd','demo_folder/demo1.py','COMPLETED','Job dispatched successfully. ID: 86',NULL,9,'2026-01-08 13:39:39','2026-01-08 13:42:19','demo_folder/requirements.txt','','86',1,1,'node_wise','00:10:00'),(95,'adasda','demo_folder/demo1.py','COMPLETED','Job dispatched successfully. ID: 87',NULL,9,'2026-01-08 13:42:41','2026-01-08 13:43:02','demo_folder/requirements.txt','','87',1,1,'node_wise','00:10:00'),(96,'asdasd','demo_folder/demo1.py','COMPLETED','Job dispatched successfully. ID: 88',NULL,9,'2026-01-08 13:43:19','2026-01-08 13:44:52','demo_folder/requirements.txt','','88',1,1,'node_wise','00:10:00');
/*!40000 ALTER TABLE `jobs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `nodes`
--

DROP TABLE IF EXISTS `nodes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `nodes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `ip_address` varchar(50) DEFAULT NULL,
  `status` varchar(50) DEFAULT NULL,
  `cpu_info` varchar(255) DEFAULT NULL,
  `memory_info` varchar(255) DEFAULT NULL,
  `gpu_info` varchar(255) DEFAULT NULL,
  `last_updated` datetime DEFAULT NULL,
  `cpu_total` int(11) DEFAULT 0,
  `cpu_used` int(11) DEFAULT 0,
  `memory_total_mb` int(11) DEFAULT 0,
  `memory_used_mb` int(11) DEFAULT 0,
  `gpu_total` int(11) DEFAULT 0,
  `gpu_used` int(11) DEFAULT 0,
  `cpu_load` int(11) DEFAULT 0,
  `free_memory_mb` int(11) DEFAULT 0,
  `operating_system` varchar(255) DEFAULT NULL,
  `cores_total` int(11) DEFAULT 0,
  `sockets` int(11) DEFAULT 0,
  `threads_per_core` int(11) DEFAULT 0,
  `slurm_version` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ix_nodes_name` (`name`),
  KEY `ix_nodes_id` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `nodes`
--

LOCK TABLES `nodes` WRITE;
/*!40000 ALTER TABLE `nodes` DISABLE KEYS */;
/*!40000 ALTER TABLE `nodes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `requests`
--

DROP TABLE IF EXISTS `requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `requests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `request_type` varchar(100) DEFAULT NULL,
  `status` varchar(50) DEFAULT NULL,
  `user_id` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `resolved_at` datetime DEFAULT NULL,
  `cpu_cores` int(11) DEFAULT 0,
  `ram_gb` int(11) DEFAULT 0,
  `storage_gb` int(11) DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `ix_requests_request_type` (`request_type`),
  KEY `ix_requests_id` (`id`),
  CONSTRAINT `requests_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `requests`
--

LOCK TABLES `requests` WRITE;
/*!40000 ALTER TABLE `requests` DISABLE KEYS */;
INSERT INTO `requests` VALUES (1,'resources','rejected',9,'2026-01-05 15:17:21','2026-01-08 13:53:28',2,2,0);
/*!40000 ALTER TABLE `requests` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `hashed_password` varchar(255) NOT NULL,
  `role` enum('ADMIN','USER','DEVELOPER') DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `cpu_limit` int(11) DEFAULT 0,
  `memory_limit_mb` int(11) DEFAULT 0,
  `storage_limit_gb` int(11) DEFAULT 15,
  `full_name` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ix_users_username` (`username`),
  UNIQUE KEY `ix_users_email` (`email`),
  KEY `ix_users_id` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES 
(
  1,'admin','syscare@am.amrita.edu','$2b$12$XAtsAI0uWPqf1arBLt0Xmu5/nGji.FQkBrfETpl8X67vD8lA6/wnO','ADMIN',1,'2026-01-02 09:08:48',0,0,0,'Administrator'),
  ( 
    2,'ranjithks','ranjithks@am.amrita.edu','$2b$12$iqS/U31iXMYP4KxyYFRxH.p3499MRP1Rw2VfSAh8k9/cE3a4QJZ1G','DEVELOPER',1,'2026-01-02 09:08:48',0,0,0,'DEVELOPER'),
    (
      9,'test','s_ranjithkumar1@cb.amrita.edu','$2b$12$X8/23yZRIGezZGS0VDbfPeJU4qyhDWLDBqyPvgS7M0iavSi0CAPku','USER',1,'2026-01-05 14:49:50',1,1024,15,'Testing User');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-03-13 10:45:48
